import { MarkdownView, Modal, Notice, Platform, Plugin, Setting, TFile, normalizePath } from "obsidian";
import { applyMigration, type MigrationResult } from "./migration/apply.ts";
import type { Fach } from "./config.ts";
import { FachModal, ThemaModal, type ThemaChoice } from "./modals";
import { computeTarget, fachFromPath, fileBaseName, findFach, linkList, linkTarget, today } from "./paths.ts";
import { collectThemen } from "./themen.ts";
import { DEFAULT_SETTINGS, SchulSettingTab, type SchulSettings } from "./settings";
import { Sorter, ensureFolder, readTemplate, type SortResult } from "./sort";
import { DEFAULT_FACH_BASE, DEFAULT_HUB_TEMPLATE, DEFAULT_THEMA_BASE, DEFAULT_TAGESNOTE_TEMPLATE, renderTemplate } from "./templates.ts";

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
        const fach = this.fachOfActiveFile();
        if (fach) this.pickThema(fach);
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
        new FachModal(this.app, this.settings.faecher, (fach) =>
          new ThemaModal(this.app, fach, this.themenOf(fach), (choice) => {
            if (choice.kind === "none") return;
            void this.sorter.ensureHub(fach, choice.name).then((hub) => this.open(hub));
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
        new ConfirmModal(
          this.app,
          "Migration ausführen?",
          "Alle Notes der konfigurierten Fächer werden nach _Themen verschoben, datierte Abschnitte werden zu Tagesnotes, Anhänge wandern nach <Fach>/attachments. Vorher ein Backup bzw. einen Git-Commit anlegen!",
          () => void this.runMigration(),
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private pickFachThenThema(): void {
    new FachModal(this.app, this.settings.faecher, (fach) => this.pickThema(fach)).open();
  }

  private pickThema(fach: Fach): void {
    new ThemaModal(this.app, fach, this.themenOf(fach), (choice) => {
      void this.createTagesnote(fach, choice).catch((e) => new Notice(`Fehler: ${(e as Error).message}`));
    }).open();
  }

  private fachOfActiveFile(): Fach | null {
    const file = this.app.workspace.getActiveFile();
    if (!file) return null;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    return findFach(linkTarget(fm?.fach), this.settings.faecher) ?? fachFromPath(file.path, this.settings);
  }

  private themenOf(fach: Fach): string[] {
    const notes = this.app.vault.getMarkdownFiles().map((f) => ({
      path: f.path,
      basename: f.basename,
      mtime: f.stat.mtime,
      fm: this.app.metadataCache.getFileCache(f)?.frontmatter,
    }));
    return collectThemen(notes, fach, this.settings);
  }

  /** Vorhandene Tagesnote desselben Fachs und Tages (egal in welchem Themenordner). */
  private findTagesnote(fach: Fach, datum: string): TFile | null {
    const name = fileBaseName(this.settings.fileNamePattern, datum, fach);
    const prefix = normalizePath(`${this.settings.root}/${fach.folder}`) + "/";
    return (
      this.app.vault.getMarkdownFiles().find((f) => f.basename === name && f.path.startsWith(prefix)) ?? null
    );
  }

  private async createTagesnote(fach: Fach, choice: ThemaChoice, datum = today()): Promise<void> {
    const thema = choice.kind === "none" ? null : choice.name;
    const existing = this.findTagesnote(fach, datum);
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

    const s = this.settings;
    const themen = thema ? [thema] : [];
    const target = computeTarget({ fach: `[[${fach.name}]]`, datum, themen: themen.map((t) => `[[${t}]]`) }, s);
    if (!target) throw new Error("Zielpfad konnte nicht bestimmt werden.");
    const template = await readTemplate(this.app, s.tagesnoteTemplate, DEFAULT_TAGESNOTE_TEMPLATE);
    const content = renderTemplate(template, {
      fach: fach.name,
      datum,
      halbjahr: target.halbjahr ?? "",
      themen,
      base: s.themaBasePath.split("/").pop() ?? s.themaBasePath,
    });
    await ensureFolder(this.app, target.folder);
    const file = await this.app.vault.create(target.path, content);
    if (thema && s.autoCreateHubs) await this.sorter.ensureHub(fach, thema, file.path);
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

  async runMigration(): Promise<MigrationResult> {
    const notice = new Notice("Migration läuft …", 0);
    this.sorter.paused = true;
    try {
      const result = await applyMigration(this.app, this.settings, (m) => notice.setMessage(`Migration: ${m}`));
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

  private async sortAll(): Promise<void> {
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
    const s = this.settings;
    const created: string[] = [];
    const write = async (path: string, content: string) => {
      const p = normalizePath(path);
      if (this.app.vault.getAbstractFileByPath(p)) return;
      const folder = p.split("/").slice(0, -1).join("/");
      if (folder) await ensureFolder(this.app, folder);
      await this.app.vault.create(p, content);
      created.push(p);
    };
    // In den Vault-Templates bleiben die Platzhalter stehen; {{base}} wird schon jetzt eingesetzt.
    const baseName = s.themaBasePath.split("/").pop() ?? s.themaBasePath;
    await write(s.tagesnoteTemplate, DEFAULT_TAGESNOTE_TEMPLATE);
    await write(s.hubTemplate, DEFAULT_HUB_TEMPLATE.replace(/\{\{base\}\}/g, baseName));
    await write(s.themaBasePath, DEFAULT_THEMA_BASE);
    await write(s.fachBasePath, DEFAULT_FACH_BASE);
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
