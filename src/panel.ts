import { ItemView, MarkdownView, TFile, normalizePath, parseYaml, setIcon, setTooltip, type WorkspaceLeaf } from "obsidian";
import { farbSchluessel, hubStats, nachbarnImThema, themaFarbe, type NoteArt, type Zeilenhoehe } from "./ansicht.ts";
import { ANZEIGE_EVENT, DatumModal, LEISTE_KNOEPFE, SCHALTER, datumBestaetigen } from "./anzeige.ts";
import type { Fach, PathConfig } from "./config.ts";
import { bereichOf } from "./defaults.ts";
import { setzeThemaFarbe } from "./gruppen.ts";
import type SchulTagesnotesPlugin from "./main";
import { findFach, linkTarget, normalizeDate, themaOf, today } from "./paths.ts";
import { SPALTEN, type BaseDatei } from "./spalten.ts";
import { collectThemenInfo } from "./themen.ts";

export const PANEL_VIEW = "schul-tagesnotes-panel";
const OFFEN_KEY = "schul-tagesnotes-panel-offen";

/**
 * Steuer-Panel für die Seitenleiste (wie bei Advanced Tables): folgt der zuletzt aktiven Markdown-Note.
 * Oben Knöpfe für die häufigsten Aktionen, darunter einklappbare Abschnitte zum Anpassen.
 */
export class SchulPanel extends ItemView {
  private plugin: SchulTagesnotesPlugin;
  private file: TFile | null = null;
  private offen: Record<string, boolean>;
  private spaltenAnsicht = "Nach Thema";

  constructor(leaf: WorkspaceLeaf, plugin: SchulTagesnotesPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.offen = (this.app.loadLocalStorage(OFFEN_KEY) as Record<string, boolean> | null) ?? { aktionen: true, ansicht: true, farben: true, darstellung: true };
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
        void this.render();
      }
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (f) => {
      if (f === this.file) void this.render();
    }));
    this.registerEvent(ws.on("file-open", (f) => {
      if (f && f.extension === "md") {
        this.file = f;
        void this.render();
      }
    }));
    this.registerEvent((ws as unknown as { on(name: string, cb: () => void): ReturnType<typeof ws.on> }).on(ANZEIGE_EVENT, () => void this.render()));
    this.file = ws.getActiveViewOfType(MarkdownView)?.file ?? ws.getActiveFile();
    await this.render();
  }

  async render(): Promise<void> {
    const el = this.contentEl;
    const scroll = el.scrollTop;
    el.empty();
    el.addClass("schul-panel");
    const p = this.plugin;
    const file = this.file;
    const art: NoteArt = p.anzeige.artOf(file);
    const fm = file ? this.app.metadataCache.getFileCache(file)?.frontmatter ?? {} : {};
    const cfg = file && art ? bereichOf(p.settings, fm) ?? p.bereiche().find((c) => c.property === fm.typ) ?? null : null;
    const fach = cfg && file ? findFach(art === "hub" ? file.basename : linkTarget(fm[cfg.property]), cfg.kategorien) : null;

    // ---------- Kopf ----------
    const kopf = el.createDiv({ cls: "schul-panel-kopf" });
    setIcon(kopf.createSpan({ cls: "schul-panel-kopf-icon" }), art === "hub" ? "house" : art === "note" ? "file-text" : "file");
    kopf.createSpan({ cls: "schul-panel-titel", text: file?.basename ?? "Keine Note aktiv" });
    if (art) kopf.createSpan({ cls: "schul-badge", text: art === "hub" ? "Hub" : "Note" });

    // ---------- Knöpfe ----------
    const kacheln = el.createDiv({ cls: "schul-kacheln" });
    const notes = p.noteInfos();
    if (art === "hub" && cfg && fach && file) {
      const st = hubStats(notes, cfg, fach);
      kachel(kacheln, "plus", "Neu", "Neue Note in diesem Fach", () => p.pickThema({ cfg, fach }));
      kachel(kacheln, "calendar-days", "Datum", "Neue Note für ein anderes Datum", () => p.pickThema({ cfg, fach }, { datumFokus: true }));
      kachel(kacheln, "calendar-search", "Prüfen", "Ansicht „Datum prüfen“", () => void p.zeigeAnsicht(file, "Datum prüfen"), st.geschaetzt || undefined);
      kachel(kacheln, "list-tree", "Themen", "Ansicht „Nach Thema“", () => void p.zeigeAnsicht(file, "Nach Thema"));
      const zahlen = el.createDiv({ cls: "schul-panel-zahlen" });
      zahl(zahlen, st.notes, "Notes");
      zahl(zahlen, st.themen, "Themen");
      zahl(zahlen, st.geschaetzt, "geschätzt");
    } else if (art === "note" && cfg && fach && file) {
      const nb = nachbarnImThema(notes, cfg, { path: file.path, basename: file.basename, mtime: 0, fm });
      const geh = (path: string | null) => {
        const f = path ? this.app.vault.getAbstractFileByPath(path) : null;
        if (f instanceof TFile) void p.open(f);
      };
      const hub = this.app.metadataCache.getFirstLinkpathDest(fach.name, file.path);
      if (hub) kachel(kacheln, "house", "Hub", `Hub ${fach.name}`, () => void p.open(hub));
      kachel(kacheln, "chevron-left", "Vorige", "Vorige Note im Thema", () => geh(nb.prev)).toggleClass("is-disabled", !nb.prev);
      kachel(kacheln, "chevron-right", "Nächste", "Nächste Note im Thema", () => geh(nb.next)).toggleClass("is-disabled", !nb.next);
      const datum = normalizeDate(fm.datum) ?? "";
      if (fm.datum_geschaetzt === true) kachel(kacheln, "check", "Bestätigen", `Geschätztes Datum ${datum} bestätigen`, () => void datumBestaetigen(p, file)).addClass("is-warn");
      kachel(kacheln, "calendar-cog", "Datum", "Datum ändern …", () => new DatumModal(p, file, datum).open());
      kachel(kacheln, "plus", "+ Thema", "Weitere Note zum selben Thema", () => p.pickThema({ cfg, fach }, { thema: themaOf(fm)[0] }));
      const info = el.createDiv({ cls: "schul-panel-info" });
      zeile(info, "Thema", `${themaOf(fm)[0] ?? "–"}${nb.von ? ` · ${nb.pos}/${nb.von}` : ""}`);
      if (typeof fm.abschnitt === "string") zeile(info, "Abschnitt", fm.abschnitt);
      zeile(info, "Datum", datum + (fm.datum_geschaetzt === true ? " ≈" : "")).toggleClass("schul-warn", fm.datum_geschaetzt === true);
    } else {
      kachel(kacheln, "calendar-plus", "Neu", "Neue Tagesnote …", () => p.pickFachThenThema());
    }

    // ---------- Hub: Ansicht, Themenfarben, Spalten ----------
    if (art === "hub" && cfg && fach && file) {
      this.abschnitt(el, "ansicht", "Ansicht im Hub", (box) => {
        const chips = box.createDiv({ cls: "schul-chips" });
        for (const v of ["Nach Datum", "Nach Thema", "Nach Halbjahr", "Nach Kapitel", "Unterthemen", "Abi-relevant", "Datum prüfen"]) {
          chips.createEl("button", { cls: "schul-chip", text: v }).addEventListener("click", () => void p.zeigeAnsicht(file, v));
        }
      });
      this.abschnitt(el, "farben", "Themenfarben", (box) => this.farben(box, cfg, fach));
      await this.abschnittAsync(el, "spalten", "Spalten", (box) => this.spalten(box, cfg));
    }

    // ---------- Darstellung ----------
    this.abschnitt(el, "darstellung", "Darstellung", (box) => {
      const reihe = box.createDiv({ cls: "schul-toggle-reihe" });
      for (const s of SCHALTER) {
        const b = reihe.createEl("button", { cls: "schul-toggle clickable-icon" });
        setIcon(b, s.icon);
        setTooltip(b, `${s.name}: ${p.settings.anzeige[s.key] ? "an" : "aus"}\n${s.desc}`);
        b.toggleClass("is-active", p.settings.anzeige[s.key]);
        b.addEventListener("click", () => void p.anzeige.toggle(s.key));
      }
      const zh = box.createDiv({ cls: "schul-zeile-steuer" });
      zh.createSpan({ cls: "schul-panel-label", text: "Zeilen" });
      const seg = zh.createDiv({ cls: "schul-segment" });
      for (const [wert, text] of [["", "S"], ["medium", "M"], ["tall", "L"], ["extra", "XL"]] as [Zeilenhoehe, string][]) {
        const b = seg.createEl("button", { text });
        setTooltip(b, `Zeilenhöhe ${text} – mehr Platz für umbrechende Spalten`);
        b.toggleClass("is-active", p.settings.anzeige.zeilenhoehe === wert);
        b.addEventListener("click", () => void p.anzeige.set("zeilenhoehe", wert));
      }
      const gr = box.createDiv({ cls: "schul-zeile-steuer" });
      gr.createSpan({ cls: "schul-panel-label", text: "Themenköpfe" });
      const slider = gr.createEl("input", { type: "range", attr: { min: "1", max: "1.6", step: "0.05" } });
      slider.value = String(p.settings.anzeige.gruppenGroesse);
      setTooltip(slider, "Schriftgröße der Themenköpfe");
      slider.addEventListener("input", () => document.body.style.setProperty("--schul-gruppen-groesse", slider.value));
      slider.addEventListener("change", () => void p.anzeige.set("gruppenGroesse", Number(slider.value)));
    });

    // ---------- Menüleiste ----------
    this.abschnitt(el, "leiste", "Knöpfe der Menüleiste", (box) => {
      const chips = box.createDiv({ cls: "schul-chips" });
      for (const k of LEISTE_KNOEPFE) {
        const an = p.settings.anzeige.leisteKnoepfe[k.id] !== false;
        const c = chips.createEl("button", { cls: "schul-chip schul-chip-icon" });
        setIcon(c.createSpan(), k.icon);
        c.createSpan({ text: k.name });
        c.toggleClass("is-active", an);
        c.addEventListener("click", () => void p.anzeige.set("leisteKnoepfe", { ...p.settings.anzeige.leisteKnoepfe, [k.id]: !an }));
      }
    });

    // ---------- Heute ----------
    const heute = notes.filter((n) => n.fm?.typ === "tagesnote" && normalizeDate(n.fm.datum) === today());
    this.abschnitt(el, "heute", `Heute (${heute.length})`, (box) => {
      if (!heute.length) box.createDiv({ cls: "schul-panel-leer", text: "Noch keine Notes heute." });
      for (const n of heute.sort((a, b) => a.basename.localeCompare(b.basename))) {
        const r = box.createDiv({ cls: "schul-panel-link" });
        setIcon(r.createSpan(), "file-text");
        r.createSpan({ text: n.basename });
        if (themaOf(n.fm)[0]) r.createSpan({ cls: "schul-panel-label", text: themaOf(n.fm)[0] });
        r.addEventListener("click", () => {
          const f = this.app.vault.getAbstractFileByPath(n.path);
          if (f instanceof TFile) void p.open(f);
        });
      }
    });
    el.scrollTop = scroll;
  }

  /** Themen des Hubs mit Farbfeld; oben die Standardfarbe. */
  private farben(box: HTMLElement, cfg: PathConfig, fach: Fach): void {
    const p = this.plugin;
    const a = p.settings.anzeige;
    const std = box.createDiv({ cls: "schul-farbzeile" });
    const stdInput = std.createEl("input", { type: "color" });
    stdInput.value = a.gruppenFarbe || "#7c5cff";
    stdInput.addEventListener("change", () => void p.anzeige.set("gruppenFarbe", stdInput.value));
    std.createSpan({ cls: "schul-farbzeile-name", text: "Standardfarbe" });
    if (a.gruppenFarbe) zurueck(std, "Akzentfarbe des Themes verwenden", () => void p.anzeige.set("gruppenFarbe", ""));
    const themen = collectThemenInfo(p.noteInfos(), fach, cfg).filter((t) => t.anzahl > 0).sort((x, y) => x.name.localeCompare(y.name, "de"));
    for (const t of themen) {
      const z = box.createDiv({ cls: "schul-farbzeile" });
      const input = z.createEl("input", { type: "color" });
      const eigen = a.themaFarben[farbSchluessel(fach.name, t.name)];
      input.value = themaFarbe(a, fach.name, t.name) ?? "#7c5cff";
      input.toggleClass("is-standard", !eigen);
      input.addEventListener("change", () => void setzeThemaFarbe(p, fach.name, t.name, input.value));
      z.createSpan({ cls: "schul-farbzeile-name", text: t.name });
      z.createSpan({ cls: "schul-panel-label", text: String(t.anzahl) });
      if (eigen) zurueck(z, "Auf Standardfarbe zurücksetzen", () => void setzeThemaFarbe(p, fach.name, t.name, null));
    }
    box.createDiv({ cls: "schul-panel-leer", text: "Tipp: Rechtsklick auf einen Themenkopf im Hub." });
  }

  /** Spalten einer Ansicht der Kategorie-Base an-/abwählen (gilt für alle Hubs des Bereichs). */
  private async spalten(box: HTMLElement, cfg: PathConfig): Promise<void> {
    const p = this.plugin;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(cfg.kategorieBasePath));
    if (!(f instanceof TFile)) return void box.createDiv({ cls: "schul-panel-leer", text: `${cfg.kategorieBasePath} fehlt.` });
    const base = (parseYaml(await this.app.vault.cachedRead(f)) ?? {}) as BaseDatei;
    const views = (base.views ?? []).filter((v) => v.type === "table" && v.name);
    if (!views.some((v) => v.name === this.spaltenAnsicht)) this.spaltenAnsicht = views[0]?.name ?? "";
    const auswahl = box.createEl("select", { cls: "dropdown" });
    for (const v of views) auswahl.createEl("option", { text: v.name!, value: v.name! });
    auswahl.value = this.spaltenAnsicht;
    auswahl.addEventListener("change", () => {
      this.spaltenAnsicht = auswahl.value;
      void this.render();
    });
    const order = views.find((v) => v.name === this.spaltenAnsicht)?.order ?? [];
    const chips = box.createDiv({ cls: "schul-chips" });
    for (const s of SPALTEN) {
      const an = order.includes(s.name);
      const c = chips.createEl("button", { cls: "schul-chip", text: s.label });
      c.toggleClass("is-active", an);
      c.addEventListener("click", () => {
        const neu = an ? order.filter((o) => o !== s.name) : [...order, s.name];
        void p.anzeige.spaltenSetzen(cfg.kategorieBasePath, this.spaltenAnsicht, neu.filter((o) => o !== "file.name")).then(() => this.render());
      });
    }
    box.createDiv({ cls: "schul-panel-leer", text: `Gilt für alle Hubs, die ${cfg.kategorieBasePath.split("/").pop()} nutzen.` });
  }

  private abschnitt(el: HTMLElement, id: string, titel: string, inhalt: (box: HTMLElement) => void): void {
    const box = this.abschnittKopf(el, id, titel);
    if (box) inhalt(box);
  }

  private async abschnittAsync(el: HTMLElement, id: string, titel: string, inhalt: (box: HTMLElement) => Promise<void>): Promise<void> {
    const box = this.abschnittKopf(el, id, titel);
    if (box) await inhalt(box);
  }

  private abschnittKopf(el: HTMLElement, id: string, titel: string): HTMLElement | null {
    const offen = this.offen[id] !== false;
    const k = el.createDiv({ cls: "schul-panel-abschnitt" });
    setIcon(k.createSpan({ cls: "schul-panel-pfeil" }), offen ? "chevron-down" : "chevron-right");
    k.createSpan({ text: titel });
    k.addEventListener("click", () => {
      this.offen[id] = !offen;
      this.app.saveLocalStorage(OFFEN_KEY, this.offen);
      void this.render();
    });
    return offen ? el.createDiv({ cls: "schul-panel-box" }) : null;
  }
}

/** Knopf-Kachel: Icon groß, kurze Beschriftung, Tooltip mit der Langform, optional Zähler. */
function kachel(el: HTMLElement, icon: string, text: string, tooltip: string, fn: () => void, zaehler?: number): HTMLElement {
  const b = el.createEl("button", { cls: "schul-kachel" });
  setIcon(b.createSpan({ cls: "schul-kachel-icon" }), icon);
  b.createSpan({ cls: "schul-kachel-text", text });
  if (zaehler) b.createSpan({ cls: "schul-kachel-zaehler", text: String(zaehler) });
  setTooltip(b, tooltip);
  b.addEventListener("click", () => {
    if (!b.hasClass("is-disabled")) fn();
  });
  return b;
}

function zahl(el: HTMLElement, wert: number, label: string): void {
  const z = el.createDiv({ cls: "schul-panel-zahl" });
  z.createDiv({ cls: "schul-panel-zahl-wert", text: String(wert) });
  z.createDiv({ cls: "schul-panel-zahl-label", text: label });
}

function zeile(el: HTMLElement, label: string, wert: string): HTMLElement {
  const z = el.createDiv({ cls: "schul-panel-zeile" });
  z.createSpan({ cls: "schul-panel-label", text: label });
  z.createSpan({ text: wert });
  return z;
}

function zurueck(el: HTMLElement, tooltip: string, fn: () => void): void {
  const b = el.createEl("button", { cls: "clickable-icon schul-zurueck" });
  setIcon(b, "rotate-ccw");
  setTooltip(b, tooltip);
  b.addEventListener("click", fn);
}

