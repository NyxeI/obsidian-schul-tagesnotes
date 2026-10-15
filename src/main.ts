import { MarkdownView, Modal, Notice, Platform, Plugin, Setting, TFile, normalizePath } from "obsidian";
import { applyMigration, type MigrationResult } from "./migration/apply.ts";
import type { Fach, PathConfig } from "./config.ts";
import { BereichModal, FachModal, ThemaModal, type KategorieWahl, type ThemaChoice } from "./modals";
import { bereichOf, pathConfig } from "./defaults.ts";
import { computeTarget, fachFromPath, fileBaseName, findFach, linkList, linkTarget, today } from "./paths.ts";
import { collectThemen } from "./themen.ts";
import { DEFAULT_SETTINGS, SchulSettingTab, mergeSettings, type SchulSettings } from "./settings";
import { Sorter, ensureFolder, readTemplate, type SortResult } from "./sort";
import { DEFAULT_HUB_TEMPLATE, DEFAULT_THEMA_BASE, DEFAULT_TAGESNOTE_TEMPLATE, kategorieBase, renderTemplate } from "./templates.ts";

export default class SchulTagesnotesPlugin extends Plugin {
  settings: SchulSettings = DEFAULT_SETTINGS;
  /** Ergebnis der letzten Migration (für Protokoll und Prüfung per CLI). */
  lastMigration: MigrationResult | null = null;
  private sorter = new Sorter(this.app, () => this.settings);

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new SchulSettingTab(this.app, this));

    this.addRibbonIcon("calendar-plus", "Neue Tagesnote", () => this.pickFachThenThema());

    this.addCommand({
      id: "neue-tagesnote",
      name: "Neue Tagesnote …",
      callback: () => this.pickFachThenThema(),
    });
    this.addCommand({
      id: "tagesnote-aktuelles-fach",
      name: "Tagesnote heute im Fach der aktuellen Note",
      callback: () => {
        const wahl = this.kategorieOfActiveFile();
        if (wahl) this.pickThema(wahl);
        else this.pickFachThenThema();
      },
    });
    this.addCommand({
      id: "einsortieren-aktuell",
      name: "Aktuelle Note einsortieren",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) void this.sorter.sortFile(file).then((r) => new Notice(resultText(r)));
        return true;
      },
    });
    this.addCommand({
      id: "einsortieren-alle",
      name: "Alle Tagesnotes einsortieren",
      callback: () => void this.sortAll(),
    });
    this.addCommand({
      id: "themen-hub-anlegen",
      name: "Themen-Hub anlegen …",
      callback: () =>
        new FachModal(this.app, this.kategorien(), ({ cfg, fach }) =>
          new ThemaModal(this.app, fach, this.themenOf(cfg, fach), (choice) => {
            if (choice.kind === "none") return;
            void this.sorter.ensureHub(cfg, fach, choice.name).then((hub) => this.open(hub));
          }, false).open(),
        ).open(),
    });
    this.addCommand({
      id: "vorlagen-anlegen",
      name: "Templates und Base im Vault anlegen",
      callback: () => void this.writeDefaults(),
    });

    this.addCommand({
      id: "migration-ausfuehren",
      name: "Migration ausführen … (alte Struktur → Hubs + Tagesnotes)",
      callback: () => {
        if (Platform.isMobile) {
          new Notice("Die Migration ist nur am Desktop möglich.");
          return;
        }
        new BereichModal(this.app, this.bereiche(), (cfg) =>
          new ConfirmModal(
            this.app,
            `Migration „${cfg.name}“ ausführen?`,
            `Alle Notes der Kategorien unter ${cfg.root} werden nach ${cfg.hubFolder} verschoben, datierte Abschnitte werden zu Tagesnotes, Anhänge wandern nach <Kategorie>/attachments. Vorher ein Backup bzw. einen Git-Commit anlegen!`,
            () => void this.runMigration(cfg),
          ).open(),
        ).open();
      },
    });

    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.metadataCache.on("changed", (file) => {
          if (this.settings.autoSort) this.sorter.schedule(file);
        }),
      );
    });
  }

  onunload(): void {
    this.sorter.cancelAll();
  }

  async loadSettings(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  bereiche(): PathConfig[] {
    return this.settings.bereiche.map((b) => pathConfig(this.settings, b));
  }

  /** Alle Kategorien aller Bereiche für die Auswahl. */
  private kategorien(): KategorieWahl[] {
    return this.bereiche().flatMap((cfg) => cfg.kategorien.map((fach) => ({ cfg, fach })));
  }

  private pickFachThenThema(): void {
    new FachModal(this.app, this.kategorien(), (wahl) => this.pickThema(wahl)).open();
  }

  private pickThema({ cfg, fach }: KategorieWahl): void {
    new ThemaModal(this.app, fach, this.themenOf(cfg, fach), (choice) => {
      void this.createTagesnote(cfg, fach, choice).catch((e) => new Notice(`Fehler: ${(e as Error).message}`));
    }).open();
  }

  private kategorieOfActiveFile(): KategorieWahl | null {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const fromFm = bereichOf(this.settings, fm);
    if (fromFm) {
      const fach = findFach(linkTarget(fm?.[fromFm.property]), fromFm.kategorien);
      if (fach) return { cfg: fromFm, fach };
    }
    for (const cfg of this.bereiche()) {
      const fach = fachFromPath(file.path, cfg);
      if (fach) return { cfg, fach };
    }
    return null;
  }

  private themenOf(cfg: PathConfig, fach: Fach): string[] {
    const notes = this.app.vault.getMarkdownFiles().map((f) => ({
      path: f.path,
      basename: f.basename,
      mtime: f.stat.mtime,
      fm: this.app.metadataCache.getFileCache(f)?.frontmatter,
    }));
    return collectThemen(notes, fach, cfg);
  }

  /** Vorhandene Tagesnote desselben Fachs und Tages (egal in welchem Themenordner). */
  private findTagesnote(cfg: PathConfig, fach: Fach, datum: string): TFile | null {
    const name = fileBaseName(cfg.fileNamePattern, datum, fach);
    const prefix = normalizePath(`${cfg.root}/${fach.folder}`) + "/";
    return (
      this.app.vault.getMarkdownFiles().find((f) => f.basename === name && f.path.startsWith(prefix)) ?? null
    );
  }

  private async createTagesnote(cfg: PathConfig, fach: Fach, choice: ThemaChoice, datum = today()): Promise<void> {
    const thema = choice.kind === "none" ? null : choice.name;
    const existing = this.findTagesnote(cfg, fach, datum);
    if (existing) {
      if (thema) {
        await this.app.fileManager.processFrontMatter(existing, (f) => {
          const themen = linkList(f.themen);
          if (!themen.includes(thema)) f.themen = [...themen, thema].map((t) => `[[${t}]]`);
        });
      }
      new Notice("Tagesnote existiert schon – geöffnet.");
      await this.open(existing);
      return;
    }

    const themen = thema ? [thema] : [];
    const target = computeTarget({ [cfg.property]: `[[${fach.name}]]`, datum, themen: themen.map((t) => `[[${t}]]`) }, cfg);
    if (!target) throw new Error("Zielpfad konnte nicht bestimmt werden.");
    const template = await readTemplate(this.app, cfg.tagesnoteTemplate, DEFAULT_TAGESNOTE_TEMPLATE);
    const content = renderTemplate(template, {
      fach: fach.name,
      datum,
      halbjahr: cfg.zeitraum === "halbjahr" ? target.halbjahr ?? "" : null,
      themen,
      base: cfg.themaBasePath.split("/").pop() ?? cfg.themaBasePath,
      property: cfg.property,
    });
    await ensureFolder(this.app, target.folder);
    const file = await this.app.vault.create(target.path, content);
    if (thema && this.settings.autoCreateHubs) await this.sorter.ensureHub(cfg, fach, thema, file.path);
    await this.open(file);
  }

  private async open(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    // Immer im Bearbeitungsmodus öffnen, auch wenn der wiederverwendete Tab im Lesemodus war.
    await leaf.openFile(file, { active: true, state: { mode: "source" } });
    const view = leaf.view instanceof MarkdownView ? leaf.view : null;
    if (view) {
      const editor = view.editor;
      const last = editor.lastLine();
      editor.setCursor({ line: last, ch: editor.getLine(last).length });
      editor.focus();
    }
  }

  async runMigration(cfg: PathConfig): Promise<MigrationResult> {
    const notice = new Notice("Migration läuft …", 0);
    this.sorter.paused = true;
    try {
      const result = await applyMigration(this.app, cfg, (m) => notice.setMessage(`Migration ${cfg.name}: ${m}`));
      this.lastMigration = result;
      notice.setMessage(
        `Migration fertig: ${result.errors.length} Fehler, ${result.newlyUnresolved.length} neu unaufgelöste Links.`,
      );
      window.setTimeout(() => notice.hide(), 10000);
      return result;
    } finally {
      this.sorter.paused = false;
    }
  }

  async sortAll(): Promise<void> {
    const counts: Partial<Record<SortResult, number>> = {};
    for (const file of this.app.vault.getMarkdownFiles()) {
      const r = await this.sorter.sortFile(file);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    new Notice(
      `Einsortiert: ${counts.moved ?? 0} verschoben, ${counts.updated ?? 0} aktualisiert, ` +
        `${counts.unchanged ?? 0} unverändert, ${counts.conflict ?? 0} Konflikte.`,
    );
  }

  /** Legt Templates und Base an, falls sie noch fehlen (überschreibt nichts). */
  private async writeDefaults(): Promise<void> {
    const created: string[] = [];
    const write = async (path: string, content: string) => {
      const p = normalizePath(path);
      if (this.app.vault.getAbstractFileByPath(p)) return;
      const folder = p.split("/").slice(0, -1).join("/");
      if (folder) await ensureFolder(this.app, folder);
      await this.app.vault.create(p, content);
      created.push(p);
    };
    // In den Vault-Templates bleiben die Platzhalter stehen; {{property}} und {{base}} werden schon jetzt eingesetzt.
    for (const cfg of this.bereiche()) {
      const baseName = cfg.themaBasePath.split("/").pop() ?? cfg.themaBasePath;
      const fixed = (t: string) => t.replace(/\{\{base\}\}/g, baseName).replace(/\{\{property\}\}/g, cfg.property);
      const tagesnote = cfg.zeitraum === "halbjahr" ? DEFAULT_TAGESNOTE_TEMPLATE : DEFAULT_TAGESNOTE_TEMPLATE.replace(/^halbjahr:.*\n/m, "");
      await write(cfg.tagesnoteTemplate, fixed(tagesnote));
      await write(cfg.hubTemplate, fixed(DEFAULT_HUB_TEMPLATE));
      await write(cfg.themaBasePath, DEFAULT_THEMA_BASE);
      await write(cfg.kategorieBasePath, kategorieBase(cfg.property, cfg.zeitraum));
    }
    new Notice(created.length ? `Angelegt: ${created.join(", ")}` : "Alles schon vorhanden.");
  }
}

function resultText(r: SortResult): string {
  return {
    moved: "Verschoben.",
    updated: "Properties aktualisiert.",
    unchanged: "Liegt schon richtig.",
    skipped: "Keine Tagesnote (typ: tagesnote mit fach und datum fehlt).",
    conflict: "Zieldatei existiert schon – nicht verschoben.",
  }[r];
}

class ConfirmModal extends Modal {
  constructor(app: import("obsidian").App, private heading: string, private text: string, private onConfirm: () => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.contentEl.createEl("p", { text: this.text });
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Abbrechen").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Ausführen")
          .setWarning()
          .onClick(() => {
            this.close();
            this.onConfirm();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
