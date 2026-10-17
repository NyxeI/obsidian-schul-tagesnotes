import { MarkdownView, Modal, Notice, Setting, TFile, normalizePath, parseYaml, setIcon, stringifyYaml } from "obsidian";
import { bodyClasses, knopfSichtbar, nachbarnImThema, noteArt, type AnzeigeSchalter, type AnzeigeSettings, type NoteArt } from "./ansicht.ts";
import type SchulTagesnotesPlugin from "./main";
import { bereichOf } from "./defaults.ts";
import { findFach, linkTarget, normalizeDate, themaOf } from "./paths.ts";
import { setzeSpalten, setzeTabellen, tabellenBreite, type BaseDatei } from "./spalten.ts";

export const ANZEIGE_EVENT = "schul-tagesnotes:anzeige";

/** Schalter mit Icon und Beschriftung – für Menüleiste, Panel, Einstellungen und Befehle. */
export const SCHALTER: { key: AnzeigeSchalter; icon: string; name: string; desc: string }[] = [
  { key: "kompakt", icon: "layout-list", name: "Kompakte Base-Ansichten", desc: "Werkzeugleiste und Rahmen der Plugin-Bases ausblenden (Sortieren/Filter erscheinen beim Darüberfahren)." },
  { key: "tasknotesInHubs", icon: "list-checks", name: "TaskNotes-Widget in Hubs", desc: "Das Subtasks/Relationships-Widget von TaskNotes in Fach- und Projekt-Hubs zeigen." },
  { key: "propertiesInNotes", icon: "list-tree", name: "Properties in datierten Notes", desc: "Den Properties-Block (typ, fach, quelle, teil …) in datierten Notes zeigen." },
  { key: "menueleiste", icon: "panel-top", name: "Menüleiste in Notes", desc: "Schmale Leiste oben in Hubs und datierten Notes mit Navigation und Schaltern." },
  { key: "volleBreite", icon: "move-horizontal", name: "Tabellen in voller Breite", desc: "Plugin-Bases nutzen die ganze Fensterbreite statt der Lesebreite." },
  { key: "fachBanner", icon: "image", name: "Fach-Banner für neue Notes", desc: "Neue Notes ohne eigenes Banner bekommen das Banner ihres Fach-Hubs." },
];

/** Knöpfe der Menüleiste (ID, Icon, Beschriftung) – im Panel ein-/ausschaltbar. */
export const LEISTE_KNOEPFE: { id: string; icon: string; name: string; wo: "hub" | "note" | "beide" }[] = [
  { id: "neu", icon: "plus", name: "Neue Note", wo: "hub" },
  { id: "datum", icon: "calendar-days", name: "Anderes Datum", wo: "hub" },
  { id: "hub", icon: "house", name: "Hub", wo: "note" },
  { id: "navigation", icon: "chevrons-left-right", name: "Vorige/nächste im Thema", wo: "note" },
  { id: "datumPruefen", icon: "check", name: "Geschätztes Datum bestätigen", wo: "note" },
  { id: "datumAendern", icon: "calendar-cog", name: "Datum ändern", wo: "note" },
  { id: "schalter", icon: "toggle-right", name: "Anzeige-Schalter", wo: "beide" },
  { id: "panel", icon: "sliders-horizontal", name: "Panel öffnen", wo: "beide" },
];

/** Setzt Klassen an <body> und an den Markdown-Views und baut die Menüleisten. */
export class Anzeige {
  private plugin: SchulTagesnotesPlugin;

  constructor(plugin: SchulTagesnotesPlugin) {
    this.plugin = plugin;
  }

  apply(): void {
    const a = this.plugin.settings.anzeige;
    for (const [cls, on] of Object.entries(bodyClasses(a))) document.body.toggleClass(cls, on);
    document.body.style.setProperty("--schul-gruppen-groesse", String(a.gruppenGroesse));
    if (a.gruppenFarbe) document.body.style.setProperty("--schul-gruppe-standard", a.gruppenFarbe);
    else document.body.style.removeProperty("--schul-gruppe-standard");
    this.refresh();
    this.plugin.gruppen?.alle();
    this.plugin.app.workspace.trigger(ANZEIGE_EVENT);
  }

  async toggle(key: AnzeigeSchalter): Promise<void> {
    await this.set(key, !this.plugin.settings.anzeige[key]);
  }

  /** Einen Anzeige-Wert setzen, speichern und anwenden (bei Breite/Zeilenhöhe auch die Bases anpassen). */
  async set<K extends keyof AnzeigeSettings>(key: K, value: AnzeigeSettings[K]): Promise<void> {
    this.plugin.settings.anzeige[key] = value;
    await this.plugin.saveSettings();
    if (key === "volleBreite" || key === "zeilenhoehe") await this.tabellenAnpassen();
    this.apply();
  }

  /** Alle Kategorie-Bases: Zeilenhöhe und Spaltenbreiten an die Anzeige anpassen. */
  async tabellenAnpassen(): Promise<void> {
    const a = this.plugin.settings.anzeige;
    for (const pfad of new Set(this.plugin.settings.bereiche.map((b) => b.kategorieBasePath))) {
      await bearbeiteBase(this.plugin, pfad, (base) => setzeTabellen(base, a.zeilenhoehe, tabellenBreite(a.volleBreite)));
    }
  }

  /** Spalten einer Ansicht in der Base eines Bereichs setzen. */
  async spaltenSetzen(basePfad: string, ansicht: string, spalten: string[]): Promise<void> {
    const breite = tabellenBreite(this.plugin.settings.anzeige.volleBreite);
    await bearbeiteBase(this.plugin, basePfad, (base) => void setzeSpalten(base, ansicht, spalten, breite));
  }

  /** Alle offenen Markdown-Views neu markieren. */
  refresh(): void {
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) this.decorate(leaf.view);
    }
  }

  artOf(file: TFile | null): NoteArt {
    if (!file) return null;
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    return noteArt(fm, this.plugin.settings.bereiche.map((b) => b.property));
  }

  decorate(view: MarkdownView): void {
    const art = this.artOf(view.file);
    view.containerEl.toggleClass("schul-hub", art === "hub");
    view.containerEl.toggleClass("schul-note", art === "note");
    view.contentEl.querySelector(":scope > .schul-notebar")?.remove();
    if (art && view.file && this.plugin.settings.anzeige.menueleiste) view.contentEl.prepend(this.notebar(view.file, art));
  }

  clear(): void {
    for (const cls of Object.keys(bodyClasses(this.plugin.settings.anzeige))) document.body.removeClass(cls);
    document.body.style.removeProperty("--schul-gruppen-groesse");
    document.body.style.removeProperty("--schul-gruppe-standard");
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      if (!(leaf.view instanceof MarkdownView)) continue;
      leaf.view.containerEl.removeClass("schul-hub", "schul-note");
      leaf.view.contentEl.querySelector(":scope > .schul-notebar")?.remove();
    }
  }

  /** Schmale Leiste: links Aktionen/Navigation, rechts die Schalter – nur die im Panel gewählten Knöpfe. */
  private notebar(file: TFile, art: Exclude<NoteArt, null>): HTMLElement {
    const p = this.plugin;
    const a = p.settings.anzeige;
    const zeige = (id: string) => knopfSichtbar(a, id);
    const bar = createDiv({ cls: "schul-notebar" });
    const links = bar.createDiv({ cls: "schul-notebar-links" });
    const rechts = bar.createDiv({ cls: "schul-notebar-rechts" });
    const fm = p.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const cfg = bereichOf(p.settings, fm) ?? p.bereiche().find((c) => c.property === fm.typ) ?? null;
    const fach = cfg ? findFach(art === "hub" ? file.basename : linkTarget(fm[cfg.property]), cfg.kategorien) : null;

    if (art === "hub" && cfg && fach) {
      if (zeige("neu")) knopf(links, "plus", `Neue Note in ${fach.name}`, () => p.pickThema({ cfg, fach }), true);
      if (zeige("datum")) knopf(links, "calendar-days", "Für anderes Datum …", () => p.pickThema({ cfg, fach }, { datumFokus: true }));
    }
    if (art === "note" && cfg && fach) {
      const hub = p.app.metadataCache.getFirstLinkpathDest(fach.name, file.path);
      if (hub && zeige("hub")) knopf(links, "house", fach.name, () => void p.open(hub), true);
      if (zeige("navigation")) {
        const nb = nachbarnImThema(p.noteInfos(), cfg, { path: file.path, basename: file.basename, mtime: 0, fm });
        const thema = themaOf(fm)[0];
        const geh = (path: string | null) => {
          const f = path ? p.app.vault.getAbstractFileByPath(path) : null;
          if (f instanceof TFile) void p.open(f);
        };
        knopf(links, "chevron-left", "Vorige Note im Thema", () => geh(nb.prev)).toggleClass("is-disabled", !nb.prev);
        links.createSpan({ cls: "schul-notebar-text", text: thema ? `${thema} · ${nb.pos}/${nb.von}` : "ohne Thema" });
        knopf(links, "chevron-right", "Nächste Note im Thema", () => geh(nb.next)).toggleClass("is-disabled", !nb.next);
      }
      const datum = normalizeDate(fm.datum) ?? "";
      if (fm.datum_geschaetzt === true && zeige("datumPruefen")) {
        const badge = links.createSpan({ cls: "schul-badge schul-badge-warn", text: `≈ ${datum}` });
        badge.setAttr("aria-label", "Datum wurde bei der Migration aus dem Dateidatum geschätzt");
        knopf(links, "check", "Datum bestätigen", () => void datumBestaetigen(p, file));
      }
      if (zeige("datumAendern")) knopf(links, "calendar-cog", "Datum ändern …", () => new DatumModal(p, file, datum).open());
    }
    if (zeige("schalter")) {
      for (const s of SCHALTER.filter((x) => x.key !== "menueleiste" && x.key !== "fachBanner")) {
        const b = knopf(rechts, s.icon, `${s.name}: ${a[s.key] ? "an" : "aus"}`, () => void p.anzeige.toggle(s.key));
        b.toggleClass("is-active", a[s.key]);
      }
    }
    if (zeige("panel")) knopf(rechts, "sliders-horizontal", "Schul-Panel öffnen", () => void p.openPanel());
    return bar;
  }
}

/** Base-Datei lesen, als Objekt ändern und zurückschreiben; Kommentarzeilen am Anfang bleiben erhalten. */
export async function bearbeiteBase(p: SchulTagesnotesPlugin, pfad: string, aendern: (base: BaseDatei) => void): Promise<boolean> {
  const f = p.app.vault.getAbstractFileByPath(normalizePath(pfad));
  if (!(f instanceof TFile)) return false;
  await p.app.vault.process(f, (text) => {
    const kopf = (/^(?:#[^\n]*\n)+/.exec(text) ?? [""])[0];
    const base = (parseYaml(text.slice(kopf.length)) ?? {}) as BaseDatei;
    aendern(base);
    return kopf + stringifyYaml(base);
  });
  return true;
}

function knopf(parent: HTMLElement, icon: string, label: string, fn: () => void, mitText = false): HTMLElement {
  const b = parent.createEl("button", { cls: "schul-notebar-knopf clickable-icon", attr: { "aria-label": label } });
  setIcon(b.createSpan(), icon);
  if (mitText) b.createSpan({ text: label });
  b.addEventListener("click", (e) => {
    e.preventDefault();
    fn();
  });
  return b;
}

/** Geschätztes Datum bestätigen: Markierung entfernen. */
export async function datumBestaetigen(p: SchulTagesnotesPlugin, file: TFile): Promise<void> {
  await p.app.fileManager.processFrontMatter(file, (fm) => {
    delete fm.datum_geschaetzt;
  });
  new Notice("Datum bestätigt.");
}

/** Datum einer Note ändern (der Sorter verschiebt sie danach); entfernt die Schätz-Markierung. */
export class DatumModal extends Modal {
  private p: SchulTagesnotesPlugin;
  private file: TFile;
  private datum: string;

  constructor(p: SchulTagesnotesPlugin, file: TFile, datum: string) {
    super(p.app);
    this.p = p;
    this.file = file;
    this.datum = datum;
  }

  onOpen(): void {
    this.titleEl.setText(`Datum ändern: ${this.file.basename}`);
    let wert = this.datum;
    const speichern = async () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return void new Notice("Bitte ein gültiges Datum wählen.");
      await this.p.app.fileManager.processFrontMatter(this.file, (fm) => {
        fm.datum = wert;
        delete fm.datum_geschaetzt;
      });
      this.close();
      new Notice("Datum geändert – die Note wird gleich einsortiert.");
    };
    new Setting(this.contentEl)
      .setName("Datum")
      .setDesc("Die Note wandert danach in das passende Halbjahr; der Name bekommt das neue Datum.")
      .addText((t) => {
        t.inputEl.type = "date";
        t.setValue(this.datum).onChange((v) => (wert = v));
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") void speichern();
        });
        window.setTimeout(() => t.inputEl.focus(), 0);
      });
    new Setting(this.contentEl).addButton((b) => b.setButtonText("Übernehmen").setCta().onClick(() => void speichern()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
