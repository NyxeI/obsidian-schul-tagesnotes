import { ItemView, MarkdownView, Setting, TFile, type WorkspaceLeaf, setIcon } from "obsidian";
import { hubStats, nachbarnImThema, type NoteArt } from "./ansicht.ts";
import { ANZEIGE_EVENT, DatumModal, SCHALTER, datumBestaetigen } from "./anzeige.ts";
import { bereichOf } from "./defaults.ts";
import type SchulTagesnotesPlugin from "./main";
import { findFach, linkTarget, normalizeDate, themaOf, today } from "./paths.ts";
import { kurzDatum } from "./themen.ts";

export const PANEL_VIEW = "schul-tagesnotes-panel";

/**
 * Steuer-Panel für die Seitenleiste (wie bei Advanced Tables): folgt der zuletzt aktiven Markdown-Note,
 * auch wenn das Panel selbst den Fokus hat.
 */
export class SchulPanel extends ItemView {
  private plugin: SchulTagesnotesPlugin;
  private file: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SchulTagesnotesPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return PANEL_VIEW;
  }

  getDisplayText(): string {
    return "Schul-Panel";
  }

  getIcon(): string {
    return "sliders-horizontal";
  }

  async onOpen(): Promise<void> {
    const ws = this.app.workspace;
    this.registerEvent(ws.on("active-leaf-change", (leaf) => {
      if (leaf?.view instanceof MarkdownView && leaf.view.file) {
        this.file = leaf.view.file;
        this.render();
      }
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (f) => {
      if (f === this.file) this.render();
    }));
    this.registerEvent(ws.on("file-open", (f) => {
      if (f && f.extension === "md") {
        this.file = f;
        this.render();
      }
    }));
    // eigenes Ereignis der Anzeige-Schalter
    this.registerEvent((ws as unknown as { on(name: string, cb: () => void): ReturnType<typeof ws.on> }).on(ANZEIGE_EVENT, () => this.render()));
    this.file = ws.getActiveViewOfType(MarkdownView)?.file ?? ws.getActiveFile();
    this.render();
  }

  render(): void {
    const el = this.contentEl;
    el.empty();
    el.addClass("schul-panel");
    const p = this.plugin;
    const file = this.file;
    const art: NoteArt = p.anzeige.artOf(file);

    // Kopf
    const kopf = el.createDiv({ cls: "schul-panel-kopf" });
    setIcon(kopf.createSpan({ cls: "schul-panel-kopf-icon" }), art === "hub" ? "house" : art === "note" ? "file-text" : "file");
    const kt = kopf.createDiv();
    kt.createDiv({ cls: "schul-panel-titel", text: file?.basename ?? "Keine Note aktiv" });
    kt.createDiv({ cls: "schul-panel-sub", text: art === "hub" ? "Hub" : art === "note" ? "Datierte Note" : file ? "Andere Note" : "" });

    if (file && art) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
      const cfg = bereichOf(p.settings, fm) ?? p.bereiche().find((c) => c.property === fm.typ) ?? null;
      const fach = cfg ? findFach(art === "hub" ? file.basename : linkTarget(fm[cfg.property]), cfg.kategorien) : null;
      const notes = p.noteInfos();
      const heute = today();

      if (art === "hub" && cfg && fach) {
        const st = hubStats(notes, cfg, fach);
        abschnitt(el, "Überblick");
        const grid = el.createDiv({ cls: "schul-panel-zahlen" });
        zahl(grid, String(st.notes), "Notes");
        zahl(grid, String(st.themen), "Themen");
        zahl(grid, String(st.geschaetzt), "Datum geschätzt");
        if (st.letzte) el.createDiv({ cls: "schul-panel-sub", text: `${kurzDatum(st.erste, heute)} – ${kurzDatum(st.letzte, heute)}` });
        aktion(el, "plus", `Neue Note in ${fach.name}`, () => p.pickThema({ cfg, fach }));
        aktion(el, "calendar-days", "Für anderes Datum …", () => p.pickThema({ cfg, fach }, { datumFokus: true }));
        if (st.geschaetzt) aktion(el, "calendar-search", `Geschätzte Daten prüfen (${st.geschaetzt})`, () => void p.zeigeAnsicht(file, "Datum prüfen"));
        abschnitt(el, "Ansicht im Hub");
        const views = el.createDiv({ cls: "schul-panel-chips" });
        for (const v of ["Nach Datum", "Nach Thema", "Nach Halbjahr", "Nach Kapitel", "Unterthemen", "Abi-relevant", "Datum prüfen"]) {
          const c = views.createEl("button", { cls: "schul-chip", text: v });
          c.addEventListener("click", () => void p.zeigeAnsicht(file, v));
        }
      }

      if (art === "note" && cfg && fach) {
        const thema = themaOf(fm)[0] ?? null;
        const datum = normalizeDate(fm.datum) ?? "";
        abschnitt(el, "Note");
        zeile(el, "Fach", fach.name);
        zeile(el, "Thema", thema ?? "–");
        if (typeof fm.abschnitt === "string") zeile(el, "Abschnitt", fm.abschnitt);
        if (fm.teil) zeile(el, "Teil", String(fm.teil));
        const dz = zeile(el, "Datum", datum + (fm.datum_geschaetzt === true ? " ≈ geschätzt" : ""));
        dz.toggleClass("schul-warn", fm.datum_geschaetzt === true);
        if (fm.datum_geschaetzt === true) aktion(el, "check", "Datum bestätigen", () => void datumBestaetigen(p, file));
        aktion(el, "calendar-cog", "Datum ändern …", () => new DatumModal(p, file, datum).open());
        const nb = nachbarnImThema(notes, cfg, { path: file.path, basename: file.basename, mtime: 0, fm });
        abschnitt(el, thema ? `Im Thema (${nb.pos}/${nb.von})` : "Navigation");
        const geh = (path: string | null) => {
          const f = path ? this.app.vault.getAbstractFileByPath(path) : null;
          if (f instanceof TFile) void p.open(f);
        };
        aktion(el, "chevron-left", "Vorige Note", () => geh(nb.prev)).toggleClass("is-disabled", !nb.prev);
        aktion(el, "chevron-right", "Nächste Note", () => geh(nb.next)).toggleClass("is-disabled", !nb.next);
        const hub = this.app.metadataCache.getFirstLinkpathDest(fach.name, file.path);
        if (hub) aktion(el, "house", `Hub ${fach.name}`, () => void p.open(hub));
        aktion(el, "plus", "Weitere Note zum Thema (heute)", () => p.pickThema({ cfg, fach }, { thema: thema ?? undefined }));
      }
    }

    // Immer: Anzeige-Schalter und allgemeine Aktionen
    abschnitt(el, "Anzeige");
    for (const s of SCHALTER) {
      new Setting(el)
        .setName(s.name)
        .setDesc(s.desc)
        .addToggle((t) => t.setValue(p.settings.anzeige[s.key]).onChange(() => void p.anzeige.toggle(s.key)));
    }
    abschnitt(el, "Allgemein");
    aktion(el, "calendar-plus", "Neue Tagesnote …", () => p.pickFachThenThema());
    const heuteNotes = p.noteInfos().filter((n) => n.fm?.typ === "tagesnote" && normalizeDate(n.fm.datum) === today());
    if (heuteNotes.length) {
      abschnitt(el, `Heute (${heuteNotes.length})`);
      for (const n of heuteNotes.sort((a, b) => a.basename.localeCompare(b.basename))) {
        aktion(el, "file-text", `${n.basename}${themaOf(n.fm)[0] ? ` · ${themaOf(n.fm)[0]}` : ""}`, () => {
          const f = this.app.vault.getAbstractFileByPath(n.path);
          if (f instanceof TFile) void p.open(f);
        });
      }
    }
  }
}

function abschnitt(el: HTMLElement, text: string): void {
  el.createDiv({ cls: "schul-panel-abschnitt", text });
}

function zahl(el: HTMLElement, wert: string, label: string): void {
  const z = el.createDiv({ cls: "schul-panel-zahl" });
  z.createDiv({ cls: "schul-panel-zahl-wert", text: wert });
  z.createDiv({ cls: "schul-panel-zahl-label", text: label });
}

function zeile(el: HTMLElement, label: string, wert: string): HTMLElement {
  const z = el.createDiv({ cls: "schul-panel-zeile" });
  z.createSpan({ cls: "schul-panel-label", text: label });
  z.createSpan({ text: wert });
  return z;
}

function aktion(el: HTMLElement, icon: string, text: string, fn: () => void): HTMLElement {
  const b = el.createDiv({ cls: "schul-panel-aktion" });
  setIcon(b.createSpan({ cls: "schul-panel-aktion-icon" }), icon);
  b.createSpan({ text });
  b.addEventListener("click", () => {
    if (!b.hasClass("is-disabled")) fn();
  });
  return b;
}
