import { MarkdownView, Modal, Notice, Platform, Plugin, Setting, TFile, normalizePath, parseYaml, stringifyYaml } from "obsidian";
import { applyMigrationV2, planV2FromVault, type MigrationV2Result } from "./migration/apply2.ts";
import { DEFAULT_V2_OPTIONS } from "./migration/plan2.ts";
import type { Fach, PathConfig } from "./config.ts";
import { BereichModal, FachModal, ListModal, TextModal, ThemaModal, type KategorieWahl, type ThemaChoice } from "./modals";
import { Journal } from "./journal-apply.ts";
import { resultLine, syncTasks } from "./tasks-apply.ts";
import { applyBegriffe, planBegriffe } from "./begriffe-apply.ts";
import { kategorieBasePfade, pluginBases, veralteteBases } from "./bases.ts";
import { planBereichHub, type BereichHubPlan } from "./bereichhub.ts";
import { runHubLinks } from "./hublinks-apply.ts";
import { runStichworte } from "./stichworte-apply.ts";
import { bereichOf, pathConfig } from "./defaults.ts";
import { computeTarget, fachFromPath, fileBaseName, findFach, freeTagesnoteName, linkTarget, suffixNumber, themaOf, today, zeitraumFor } from "./paths.ts";
import { notesAmTag, shiftDate } from "./ansicht.ts";
import { Anzeige, SCHALTER } from "./anzeige.ts";
import { bannerWert, planBanner, type BannerEintrag } from "./banner.ts";
import { Gruppen } from "./gruppen.ts";
import { PANEL_VIEW, SchulPanel } from "./panel.ts";
import { collectThemenInfo, kategorieStats, sortByRecent, type NoteInfo, type ThemaInfo } from "./themen.ts";
import { DEFAULT_SETTINGS, SchulSettingTab, mergeSettings, type SchulSettings } from "./settings";
import { Sorter, ensureFolder, readTemplate, type SortResult } from "./sort";
import { addTagBaseEmbed, DEFAULT_TAGESNOTE_TEMPLATE, renderTemplate } from "./templates.ts";

export default class SchulTagesnotesPlugin extends Plugin {
  settings: SchulSettings = DEFAULT_SETTINGS;
  /** Ergebnis der letzten Migration (für Protokoll und Prüfung per CLI). */
  lastMigration: MigrationV2Result | null = null;
  private sorter = new Sorter(this.app, () => this.settings);
  journal = new Journal(this.app, () => this.settings, this.sorter);
  anzeige = new Anzeige(this);
  gruppen: Gruppen | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.anzeige.apply();
    this.addSettingTab(new SchulSettingTab(this.app, this));
    this.sorter.extra = (file, fm) => this.journal.sort(file, fm);

    this.addRibbonIcon("calendar-plus", "Neue Tagesnote", () => this.pickFachThenThema());
    this.registerView(PANEL_VIEW, (leaf) => new SchulPanel(leaf, this));
    this.addRibbonIcon("sliders-horizontal", "Schul-Panel", () => void this.openPanel());

    // ---------- Anzeige ----------
    this.addCommand({ id: "panel-oeffnen", name: "Schul-Panel öffnen", callback: () => void this.openPanel() });
    for (const sch of SCHALTER) {
      this.addCommand({ id: `anzeige-${sch.key}`, name: `Anzeige umschalten: ${sch.name}`, callback: () => void this.anzeige.toggle(sch.key) });
    }
    this.addCommand({
      id: "tagesnote-anderes-datum",
      name: "Tagesnote für anderes Datum …",
      callback: () => {
        const wahl = this.kategorieOfActiveFile();
        if (wahl) this.pickThema(wahl, { datumFokus: true });
        else new FachModal(this.app, this.kategorien(), (w) => this.pickThema(w, { datumFokus: true }), today()).open();
      },
    });

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
      id: "vorlagen-anlegen",
      name: "Templates und Base im Vault anlegen",
      callback: () => void this.writeDefaults(),
    });

    this.addCommand({
      id: "migration-ausfuehren",
      name: "Migration ausführen … (Themen-Notes → datierte Notes, ein Hub pro Kategorie)",
      callback: () => {
        if (Platform.isMobile) {
          new Notice("Die Migration ist nur am Desktop möglich.");
          return;
        }
        new BereichModal(this.app, this.bereiche(), (cfg) =>
          void planV2FromVault(this.app, cfg, { ...DEFAULT_V2_OPTIONS, fachBanner: this.settings.anzeige.fachBanner }).then((plan) =>
            new ConfirmModal(
              this.app,
              `Migration „${cfg.name}“ ausführen?`,
              `${plan.sources.length} Notes werden zu ${plan.parts.length} datierten Notes (an #/##-Überschriften und Datumsmarken geteilt; ` +
                `${plan.parts.filter((p) => p.geschaetzt).length} mit geschätztem Datum). Links in ${plan.linkEdits.size} weiteren Notes werden umgeleitet, ` +
                `${plan.files.length} Dateien wandern nach <Kategorie>/attachments, die alten Notes kommen in den Papierkorb. Vorher ein Backup anlegen!`,
              () => void this.runMigration(cfg),
            ).open(),
          ),
        ).open();
      },
    });

    // ---------- Journal ----------
    this.addCommand({
      id: "neue-journal-note",
      name: "Neue Journal-Note …",
      callback: () =>
        new ListModal(this.app, this.settings.journal.kategorien, "Journal-Kategorie wählen …", (kat) =>
          new TextModal(this.app, `Neue Journal-Note: ${kat}`, (titel) =>
            void this.journal.create(kat, titel).then((f) => this.open(f)).catch((e) => new Notice(`Fehler: ${(e as Error).message}`)),
          ).open(),
        ).open(),
    });
    this.addCommand({
      id: "notizblock-archivieren",
      name: "Notizblock archivieren",
      icon: "archive",
      callback: () => void this.archiveNotizblock(),
    });
    this.addCommand({
      id: "notizblock-knopf-toolbar",
      name: "Notizblock-Knopf zur Editing Toolbar hinzufügen",
      callback: () => void this.addToolbarButton(),
    });
    this.addCommand({
      id: "journal-migration",
      name: "Journal-Migration ausführen … (Unique Notes, Daily Notes, Tagespläne)",
      callback: () => {
        if (Platform.isMobile) return void new Notice("Die Migration ist nur am Desktop möglich.");
        void this.journal.planMigration().then((plan) =>
          new ConfirmModal(
            this.app,
            "Journal-Migration ausführen?",
            `${plan.ops.length} Notes wandern nach ${this.settings.journal.root}/<Jahr>/<Monat>/, ${plan.hubs.length} Kategorie-Hubs werden angelegt` +
              (plan.notizblock ? `, ${plan.notizblock.from.split("/").pop()} wird zum festen Notizblock` : "") +
              `. ${plan.skipped.length} Notes ohne Datum bleiben liegen. Vorher ein Backup anlegen!`,
            () => void this.runJournalMigration(),
          ).open(),
        );
      },
    });

    // ---------- Aufgaben ----------
    this.addCommand({
      id: "aufgaben-verlinken-aktuell",
      name: "Aufgaben der aktuellen Note mit TaskNotes verlinken",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void syncTasks(this.app, this.settings, file).then((r) => new Notice(resultLine(r)));
        return true;
      },
    });
    this.addCommand({
      id: "aufgaben-verlinken-alle",
      name: "Aufgaben aus Notizblock, ToDo-Notes und Aufgaben-Quellen mit TaskNotes verlinken …",
      callback: () =>
        void this.journal.linkAllTasks(this.settings.tasks.quellen, true).then((r) =>
          new ConfirmModal(
            this.app,
            "Aufgaben verlinken?",
            `${r.files} Notes: ${r.neu} neue TaskNotes, ${r.verlinkt} Checkboxen werden mit vorhandenen verlinkt, ${r.abgeglichen} Status-Abgleiche. Die Checkboxen bleiben stehen und bekommen einen Link.`,
            () =>
              void this.journal
                .linkAllTasks(this.settings.tasks.quellen, false)
                .then((x) => new Notice(`${x.files} Notes: ${resultLine(x)}`, 10000)),
          ).open(),
        ),
    });

    // ---------- Tags & Unterthemen ----------
    this.addCommand({
      id: "tags-vereinheitlichen",
      name: "Tags vereinheitlichen & Unterthemen eintragen …",
      callback: () =>
        void runStichworte(this.app, this.settings, true).then((r) =>
          new ConfirmModal(
            this.app,
            "Tags vereinheitlichen?",
            `${r.notes} Notes ändern sich: ${r.inlineTags} Inline-Tags in ${r.textNotes} Notes werden umgeschrieben bzw. entfernt (Fach-Dubletten), ` +
              `${r.tags.size} einheitliche Tags (stichwort/, person/, markierung/), Unterthemen in ${r.unterthemen} Hubs/Tagesnotes. ` +
              "Journal, Aufgaben-Quellen und TaskNotes bleiben unverändert. Vorher ein Backup anlegen!",
            () =>
              void runStichworte(this.app, this.settings, false).then((x) => {
                this.stichwortResult = x;
                new Notice(`Tags: ${x.notes} Notes, ${x.inlineTags} Inline-Tags, ${x.errors.length} Fehler.`, 10000);
              }),
          ).open(),
        ),
    });

    // ---------- Übersicht & Bases ----------
    this.addCommand({
      id: "bereichs-hubs-einrichten",
      name: "Bereichs-Hubs einrichten (Karten der Fächer/Projekte) …",
      callback: () =>
        void this.planBereichHubs().then((plans) => {
          if (plans.size === 0) return void new Notice("Bereichs-Hubs sind schon eingerichtet.");
          const text = [...plans].map(([f, p]) => `${f.path}: ${p.eingebettet ? `Karten „${p.view}“ oben einbetten` : ""}${p.eingebettet && p.repariert ? ", " : ""}${p.repariert ? `${p.repariert} kaputte Links reparieren` : ""}`);
          new ConfirmModal(this.app, "Bereichs-Hubs einrichten?", `${text.join("; ")}. Fehlende Übersichts-Base wird angelegt.`, () =>
            void (async () => {
              const base = normalizePath(this.settings.bereichBasePath);
              if (!this.app.vault.getAbstractFileByPath(base)) {
                const stale = await this.staleBases();
                const content = stale.get(base);
                if (content) await this.writeBases(new Map([[base, content]]));
              }
              for (const [f, p] of plans) await this.app.vault.process(f, (c) => planBereichHub(c, base.split("/").pop()!, p.view).content ?? c);
              new Notice(`Bereichs-Hubs: ${plans.size} eingerichtet.`);
            })(),
          ).open();
        }),
    });
    this.addCommand({
      id: "bases-aktualisieren",
      name: "Base-Dateien auf Plugin-Stand bringen …",
      callback: () =>
        void this.staleBases().then((stale) =>
          stale.size === 0
            ? new Notice("Alle Bases sind auf dem Plugin-Stand.")
            : new ConfirmModal(
                this.app,
                "Bases neu schreiben?",
                `${stale.size} Bases weichen ab und werden neu geschrieben: ${[...stale.keys()].join(", ")}. Spalten und Zeilenhöhe aus dem Panel bleiben erhalten, andere eigene Änderungen (Sortierung, zusätzliche Ansichten) gehen dabei verloren – Git-Commit oder Backup vorher!`,
                () => void this.writeBases(stale),
              ).open(),
        ),
    });

    this.addCommand({
      id: "banner-nachtragen",
      name: "Banner nachtragen … (aus der früheren Note bzw. vom Fach-Hub)",
      callback: () => {
        const plan = this.bannerPlan();
        if (!plan.length) return void new Notice("Alle datierten Notes haben schon ein Banner.");
        const q = plan.filter((e) => e.herkunft === "quelle").length;
        new ConfirmModal(
          this.app,
          "Banner nachtragen?",
          `${plan.length} datierte Notes bekommen ein Banner: ${q} von ihrer früheren Themen-Note, ${plan.length - q} vom Fach-Hub` +
            (this.settings.anzeige.fachBanner ? "" : " (Fach-Banner ist ausgeschaltet)") + ". Nur die Property „banner“ wird gesetzt.",
          () =>
            void (async () => {
              for (const e of plan) {
                const f = this.app.vault.getAbstractFileByPath(e.path);
                if (f instanceof TFile) await this.app.fileManager.processFrontMatter(f, (fm) => (fm.banner = e.banner));
              }
              new Notice(`Banner gesetzt: ${plan.length} Notes.`);
            })(),
        ).open();
      },
    });

    // ---------- Linklisten in Kategorie-Hubs ----------
    this.addCommand({
      id: "hub-linklisten-ersetzen",
      name: "Linklisten in Fach-Hubs durch Base-Ansicht ersetzen …",
      callback: () =>
        void runHubLinks(this.app, this.settings, true).then((r) =>
          r.hubs.length === 0
            ? new Notice("Keine Linklisten mehr umzustellen.")
            : new ConfirmModal(
                this.app,
                "Linklisten ersetzen?",
                `${r.hubs.length} Hubs: Die Linkliste oben wird zu einem eingeklappten Callout „Alte Linkliste“, darüber kommt die Ansicht „Nach Thema“. ` +
                  "Nichts wird gelöscht. Vorher ein Backup anlegen!",
                () =>
                  void runHubLinks(this.app, this.settings, false).then((x) =>
                    new Notice(`Linklisten: ${x.hubs.length} Hubs umgestellt, ${x.errors.length} Fehler.`, 10000),
                  ),
              ).open(),
        ),
    });

    // ---------- Begriffe ----------
    this.addCommand({
      id: "begriffe-verlinken",
      name: "Begriffe & Personen verlinken … (Ressourcen-Properties, Themen, Links in Notes)",
      callback: () =>
        void planBegriffe(this.app, this.settings, this.settings.begriffeAusschluss).then((plan) =>
          new ConfirmModal(
            this.app,
            "Begriffe & Personen verlinken?",
            `${plan.terms} Begriffe/Personen, ${plan.themen.size} davon kommen vor: ${plan.links} Links in ${plan.mentions.size} Hubs/Tagesnotes ` +
              "(je Note das erste Vorkommen). Alle Ressourcen-Notes bekommen typ und Tag; Begriffe bekommen themen/kategorien. Vorher ein Backup anlegen!",
            () =>
              void applyBegriffe(this.app, this.settings, this.settings.begriffeAusschluss).then((r) => {
                this.begriffeResult = r;
                new Notice(`Begriffe: ${r.ressourcen} Ressourcen, ${r.begriffe} Begriffe verknüpft, ${r.links} Links, ${r.errors.length} Fehler.`, 10000);
              }),
          ).open(),
        ),
    });

    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.metadataCache.on("changed", (file) => {
          if (this.settings.autoSort) this.sorter.schedule(file);
          this.refreshAnzeigeBald();
        }),
      );
      this.registerEvent(this.app.workspace.on("layout-change", () => this.anzeige.refresh()));
      this.registerEvent(this.app.workspace.on("file-open", () => this.anzeige.refresh()));
      this.gruppen = new Gruppen(this);
      this.gruppen.start();
      this.anzeige.apply();
    });
  }

  private anzeigeTimer: number | null = null;
  /** Menüleisten nach Metadaten-Änderungen gebündelt neu bauen. */
  private refreshAnzeigeBald(): void {
    if (this.anzeigeTimer !== null) window.clearTimeout(this.anzeigeTimer);
    this.anzeigeTimer = window.setTimeout(() => {
      this.anzeigeTimer = null;
      this.anzeige.refresh();
    }, 500);
  }

  /** Banner des Kategorie-Hubs (Property "banner"), falls vorhanden. */
  hubBanner(cfg: PathConfig, fachName: string): string | null {
    const hub = this.app.vault.getAbstractFileByPath(normalizePath(`${cfg.root}/${cfg.kategorien.find((k) => k.name === fachName)?.folder ?? fachName}/${fachName}.md`));
    return hub instanceof TFile ? bannerWert(this.app.metadataCache.getFileCache(hub)?.frontmatter?.banner) : null;
  }

  /** Datierte Notes aller Bereiche, die ein Banner bekommen sollen. */
  bannerPlan(): BannerEintrag[] {
    const notes = this.noteInfos();
    return this.bereiche().flatMap((cfg) => planBanner(notes, cfg, (f) => this.hubBanner(cfg, f), this.settings.anzeige.fachBanner));
  }

  /** Steuer-Panel in der rechten Seitenleiste öffnen (oder zeigen). */
  async openPanel(): Promise<void> {
    const ws = this.app.workspace;
    let leaf = ws.getLeavesOfType(PANEL_VIEW)[0];
    if (!leaf) {
      leaf = ws.getRightLeaf(false)!;
      await leaf.setViewState({ type: PANEL_VIEW, active: true });
    }
    await ws.revealLeaf(leaf);
  }

  /** Oberste Base-Einbettung des Hubs auf eine Ansicht umstellen (bleibt in der Note gespeichert). */
  async zeigeAnsicht(hub: TFile, ansicht: string): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(hub)?.frontmatter ?? {};
    const cfg = this.bereiche().find((c) => c.property === fm.typ);
    if (!cfg) return;
    const base = cfg.kategorieBasePath.split("/").pop()!;
    const re = new RegExp(`!\\[\\[${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(#[^\\]|]*)?\\]\\]`);
    let changed = false;
    await this.app.vault.process(hub, (c) => {
      if (!re.test(c)) return c;
      changed = true;
      return c.replace(re, `![[${base}#${ansicht}]]`);
    });
    if (!changed) new Notice(`Keine Einbettung von ${base} im Hub gefunden.`);
    // Hub zeigen, ohne den Cursor ans Ende zu setzen (die Base steht oben)
    const offen = this.app.workspace.getLeavesOfType("markdown").find((l) => l.view instanceof MarkdownView && l.view.file === hub);
    if (offen) this.app.workspace.setActiveLeaf(offen, { focus: true });
    else await this.app.workspace.getLeaf(false).openFile(hub);
  }

  onunload(): void {
    this.gruppen?.stop();
    this.anzeige.clear();
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
    const notes = this.noteInfos();
    const alle = this.bereiche().flatMap((cfg) => {
      const stats = kategorieStats(notes, cfg);
      return cfg.kategorien.map((fach) => ({ cfg, fach, ...(stats.get(fach.name) ?? {}) }));
    });
    return sortByRecent(alle, (k) => k.zuletzt ?? "");
  }

  pickFachThenThema(): void {
    new FachModal(this.app, this.kategorien(), (wahl) => this.pickThema(wahl), today()).open();
  }

  pickThema({ cfg, fach }: KategorieWahl, opts: { datum?: string; datumFokus?: boolean; thema?: string } = {}): void {
    const heute = today();
    const relativ = (folder: string) => folder.slice(normalizePath(`${cfg.root}/${fach.folder}`).length + 1);
    const ziel = (thema: string | null, datum: string) => {
      const t = computeTarget({ [cfg.property]: `[[${fach.name}]]`, datum, thema: thema ?? undefined }, cfg);
      if (!t) return "";
      const names = new Set(this.app.vault.getMarkdownFiles().map((f) => f.basename));
      return `${relativ(t.folder)}/${freeTagesnoteName(fileBaseName(cfg.fileNamePattern, datum, fach), (n) => names.has(n))}`;
    };
    const modal = new ThemaModal(
      this.app,
      fach,
      this.themenOf(cfg, fach),
      (choice, datum) => {
        if (choice.kind === "open") {
          const f = this.app.vault.getAbstractFileByPath(choice.path);
          if (f instanceof TFile) void this.open(f);
          return;
        }
        void this.createTagesnote(cfg, fach, choice, datum).catch((e) => new Notice(`Fehler: ${(e as Error).message}`));
      },
      true,
      {
        datum: opts.datum ?? heute,
        heute,
        datumFokus: opts.datumFokus,
        zeitraum: (d) => zeitraumFor(d, cfg) ?? cfg.noHalbjahrFolder,
        vorhanden: (d) => notesAmTag(this.noteInfos(), cfg, fach, d),
        ziel,
        verschiebe: shiftDate,
      },
    );
    modal.open();
    if (opts.thema) {
      modal.inputEl.value = opts.thema;
      modal.inputEl.dispatchEvent(new Event("input"));
    }
  }

  kategorieOfActiveFile(): KategorieWahl | null {
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

  noteInfos(): NoteInfo[] {
    return this.app.vault.getMarkdownFiles().map((f) => ({
      path: f.path,
      basename: f.basename,
      mtime: f.stat.mtime,
      fm: this.app.metadataCache.getFileCache(f)?.frontmatter,
    }));
  }

  private themenOf(cfg: PathConfig, fach: Fach): ThemaInfo[] {
    return collectThemenInfo(this.noteInfos(), fach, cfg);
  }

  /** Vorhandene Tagesnote desselben Fachs und Tages (egal in welchem Themenordner). */
  /** Notes desselben Fachs und Tages (egal in welchem Themenordner, mit oder ohne Suffix " (n)"). */
  private tagesnotesOf(cfg: PathConfig, fach: Fach, datum: string): TFile[] {
    const base = fileBaseName(cfg.fileNamePattern, datum, fach);
    const prefix = normalizePath(`${cfg.root}/${fach.folder}`) + "/";
    return this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix) && suffixNumber(f.basename, base) !== null);
  }

  /** Vorhandene Note desselben Fachs, Tages und Themas (ohne Thema: die ohne Thema). */
  private findTagesnote(cfg: PathConfig, fach: Fach, datum: string, thema: string | null): TFile | null {
    return (
      this.tagesnotesOf(cfg, fach, datum).find((f) => {
        const t = themaOf(this.app.metadataCache.getFileCache(f)?.frontmatter)[0] ?? null;
        return t === thema;
      }) ?? null
    );
  }

  private async createTagesnote(cfg: PathConfig, fach: Fach, choice: ThemaChoice, datum = today()): Promise<void> {
    if (choice.kind === "open") return;
    const thema = choice.kind === "none" ? null : choice.name;
    const existing = this.findTagesnote(cfg, fach, datum, thema);
    if (existing) {
      new Notice("Note zu diesem Thema gibt es heute schon – geöffnet.");
      await this.open(existing);
      return;
    }

    const target = computeTarget({ [cfg.property]: `[[${fach.name}]]`, datum, thema: thema ?? undefined }, cfg);
    if (!target) throw new Error("Zielpfad konnte nicht bestimmt werden.");
    const base = fileBaseName(cfg.fileNamePattern, datum, fach);
    const names = new Set(this.app.vault.getMarkdownFiles().map((f) => f.basename));
    const path = `${target.folder}/${freeTagesnoteName(base, (n) => names.has(n))}.md`;
    const template = await readTemplate(this.app, cfg.tagesnoteTemplate, DEFAULT_TAGESNOTE_TEMPLATE);
    const content = renderTemplate(template, {
      fach: fach.name,
      datum,
      halbjahr: cfg.zeitraum === "halbjahr" ? target.halbjahr ?? "" : null,
      themen: thema ? [thema] : [],
      base: "",
      property: cfg.property,
    });
    await ensureFolder(this.app, target.folder);
    const neu = await this.app.vault.create(path, content);
    const banner = this.settings.anzeige.fachBanner ? this.hubBanner(cfg, fach.name) : null;
    if (banner) await this.app.fileManager.processFrontMatter(neu, (fm) => (fm.banner = banner));
    await this.open(neu);
  }

  async open(file: TFile): Promise<void> {
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

  async archiveNotizblock(): Promise<void> {
    try {
      new Notice(await this.journal.archiveNotizblock(), 8000);
    } catch (e) {
      new Notice(`Fehler: ${(e as Error).message}`);
    }
  }

  /** Trägt den Befehl „Notizblock archivieren“ als Knopf in die Editing Toolbar ein. */
  async addToolbarButton(): Promise<void> {
    const plugins = (this.app as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins.plugins;
    const tb = plugins["editing-toolbar"] as { settings?: { menuCommands?: { id: string; name: string; icon: string }[] }; saveSettings?: () => Promise<void> } | undefined;
    if (!tb?.settings?.menuCommands || !tb.saveSettings) {
      new Notice("Editing Toolbar nicht gefunden oder nicht aktiv. Den Befehl „Notizblock archivieren“ dort von Hand hinzufügen.");
      return;
    }
    const id = `${this.manifest.id}:notizblock-archivieren`;
    if (tb.settings.menuCommands.some((c) => c.id === id)) {
      new Notice("Der Knopf ist schon in der Editing Toolbar.");
      return;
    }
    tb.settings.menuCommands.push({ id, name: "Notizblock archivieren", icon: "archive" });
    await tb.saveSettings();
    // Die Toolbar liest ihre Knöpfe nur beim Laden – einmal neu starten.
    const mgr = (this.app as unknown as { plugins: { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> } }).plugins;
    await mgr.disablePlugin("editing-toolbar");
    await mgr.enablePlugin("editing-toolbar");
    new Notice("Knopf „Notizblock archivieren“ zur Editing Toolbar hinzugefügt.");
  }

  journalResult: unknown = null;
  begriffeResult: unknown = null;
  stichwortResult: unknown = null;

  async runJournalMigration(): Promise<void> {
    const notice = new Notice("Journal-Migration läuft …", 0);
    this.sorter.paused = true;
    try {
      const r = await this.journal.migrate((m) => notice.setMessage(`Journal: ${m}`));
      this.journalResult = r;
      notice.setMessage(`Journal-Migration fertig: ${r.plan.ops.length} Notes, ${r.errors.length} Fehler.`);
      window.setTimeout(() => notice.hide(), 10000);
    } finally {
      this.sorter.paused = false;
    }
  }

  async runMigration(cfg: PathConfig): Promise<MigrationV2Result> {
    const notice = new Notice("Migration läuft …", 0);
    this.sorter.paused = true;
    try {
      const result = await applyMigrationV2(this.app, cfg, (m) => notice.setMessage(`Migration ${cfg.name}: ${m}`), {
        ...DEFAULT_V2_OPTIONS,
        fachBanner: this.settings.anzeige.fachBanner,
      });
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
    const daily = this.dailyOptions();
    for (const [path, content] of pluginBases(this.settings, daily.format || "YYYY-MM-DD")) await write(path, content);
    for (const cfg of this.bereiche()) {
      const baseName = cfg.themaBasePath.split("/").pop() ?? cfg.themaBasePath;
      const fixed = (t: string) => t.replace(/\{\{base\}\}/g, baseName).replace(/\{\{property\}\}/g, cfg.property);
      const tagesnote = cfg.zeitraum === "halbjahr" ? DEFAULT_TAGESNOTE_TEMPLATE : DEFAULT_TAGESNOTE_TEMPLATE.replace(/^halbjahr:.*\n/m, "");
      await write(cfg.tagesnoteTemplate, fixed(tagesnote));
    }
    // Calendar-Plugin öffnet Daily Notes → dort die Tagesübersicht einbetten
    if (daily.template) {
      const tpl = this.app.vault.getAbstractFileByPath(normalizePath(daily.template.endsWith(".md") ? daily.template : `${daily.template}.md`));
      const baseName = this.settings.tagBasePath.split("/").pop() ?? this.settings.tagBasePath;
      if (tpl instanceof TFile && !(await this.app.vault.read(tpl)).includes(`![[${baseName}`)) {
        await this.app.vault.process(tpl, (c) => addTagBaseEmbed(c, baseName));
        created.push(`${tpl.path} (Tagesübersicht)`);
      }
    }
    new Notice(created.length ? `Angelegt: ${created.join(", ")}` : "Alles schon vorhanden.");
  }

  private dailyOptions(): { format?: string; template?: string } {
    return (this.app as any).internalPlugins?.getPluginById?.("daily-notes")?.instance?.options ?? {};
  }

  /** Plugin-Bases, die inhaltlich vom Plugin-Stand abweichen (Pfad → neuer Inhalt, Panel-Einstellungen bleiben). */
  private async staleBases(): Promise<Map<string, string>> {
    const soll = pluginBases(this.settings, this.dailyOptions().format || "YYYY-MM-DD");
    const ist = new Map<string, string | null>();
    for (const path of soll.keys()) {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(path));
      ist.set(path, f instanceof TFile ? await this.app.vault.read(f) : null);
    }
    const yaml = { parse: parseYaml, stringify: stringifyYaml };
    const stale = veralteteBases(soll, ist, kategorieBasePfade(this.settings), this.settings.anzeige, yaml);
    return new Map([...stale].map(([path, content]) => [normalizePath(path), content]));
  }

  private async writeBases(stale: Map<string, string>): Promise<void> {
    for (const [path, content] of stale) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await this.app.vault.modify(f, content);
      else {
        await ensureFolder(this.app, path.split("/").slice(0, -1).join("/"));
        await this.app.vault.create(path, content);
      }
    }
    new Notice(`Bases aktualisiert: ${[...stale.keys()].join(", ")}`, 10000);
  }

  /** Bereichs-Hubs: Pfad → Plan (Karten einbetten, kaputte Links reparieren). */
  private async planBereichHubs(): Promise<Map<TFile, BereichHubPlan & { view: string }>> {
    const out = new Map<TFile, BereichHubPlan & { view: string }>();
    const baseName = this.settings.bereichBasePath.split("/").pop() ?? this.settings.bereichBasePath;
    for (const b of this.settings.bereiche) {
      if (!b.hubPath) continue;
      const f = this.app.vault.getAbstractFileByPath(normalizePath(b.hubPath));
      if (!(f instanceof TFile)) continue;
      const plan = planBereichHub(await this.app.vault.read(f), baseName, b.name);
      if (plan.content) out.set(f, { ...plan, view: b.name });
    }
    return out;
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
