import { MarkdownView, Menu, Modal, Setting } from "obsidian";
import { farbSchluessel, normalisiereFarbe, themaFarbe } from "./ansicht.ts";
import type SchulTagesnotesPlugin from "./main";

/** Vorschläge im Farbdialog. */
export const FARB_VORSCHLAEGE = ["#4cc9f0", "#4361ee", "#7209b7", "#f72585", "#fb8500", "#ffb703", "#06d6a0", "#2a9d8f", "#e63946", "#8d99ae"];

/**
 * Färbt die Themenköpfe (Gruppen „Thema“) in den Kategorie-Bases der Hubs: Klasse `schul-gruppe` am Kopf,
 * `schul-gruppe-tabelle` und die Variable `--schul-gruppe` an der Gruppe. Rechtsklick auf einen Kopf: Farbe wählen.
 */
export class Gruppen {
  private plugin: SchulTagesnotesPlugin;
  private beobachter: MutationObserver | null = null;
  private timer: number | null = null;

  constructor(plugin: SchulTagesnotesPlugin) {
    this.plugin = plugin;
  }

  start(): void {
    this.beobachter = new MutationObserver(() => this.bald());
    this.beobachter.observe(document.body, { childList: true, subtree: true });
    this.plugin.registerDomEvent(document, "contextmenu", (e) => this.kontextmenue(e), { capture: true });
    this.alle();
  }

  stop(): void {
    this.beobachter?.disconnect();
    if (this.timer !== null) window.clearTimeout(this.timer);
    for (const el of Array.from(document.querySelectorAll(".schul-gruppe, .schul-gruppe-tabelle"))) {
      el.removeClass("schul-gruppe", "schul-gruppe-tabelle");
      (el as HTMLElement).style.removeProperty("--schul-gruppe");
    }
  }

  private bald(): void {
    if (this.timer !== null) return;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.alle();
    }, 250);
  }

  /** Basisnamen der Kategorie-Bases (Fach.base, Projekt.base). */
  private baseNamen(): string[] {
    return [...new Set(this.plugin.settings.bereiche.map((b) => b.kategorieBasePath.split("/").pop() ?? b.kategorieBasePath))];
  }

  alle(): void {
    const namen = this.baseNamen();
    const a = this.plugin.settings.anzeige;
    for (const leaf of this.plugin.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !view.file) continue;
      if (this.plugin.anzeige.artOf(view.file) !== "hub") continue;
      const kategorie = view.file.basename;
      for (const embed of Array.from(view.contentEl.querySelectorAll(".bases-embed"))) {
        const src = embed.getAttribute("src") ?? "";
        if (!namen.some((n) => src.startsWith(n))) continue;
        for (const kopf of Array.from(embed.querySelectorAll<HTMLElement>(".bases-group-heading"))) {
          const eigenschaft = kopf.querySelector(".bases-group-property")?.textContent?.trim();
          const wert = kopf.querySelector(".bases-group-value")?.textContent?.trim();
          if (!wert || !eigenschaft || !/^thema$/i.test(eigenschaft)) continue;
          const farbe = themaFarbe(a, kategorie, wert);
          const tabelle = kopf.parentElement;
          kopf.addClass("schul-gruppe");
          kopf.dataset.schulKategorie = kategorie;
          kopf.dataset.schulThema = wert;
          for (const el of [kopf, tabelle]) {
            if (!el) continue;
            if (farbe) el.style.setProperty("--schul-gruppe", farbe);
            else el.style.removeProperty("--schul-gruppe");
          }
          tabelle?.addClass("schul-gruppe-tabelle");
        }
      }
    }
  }

  private kontextmenue(e: MouseEvent): void {
    const kopf = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".schul-gruppe");
    if (!kopf?.dataset.schulThema || !kopf.dataset.schulKategorie) return;
    e.preventDefault();
    e.stopPropagation();
    const kategorie = kopf.dataset.schulKategorie;
    const thema = kopf.dataset.schulThema;
    const menu = new Menu();
    menu.addItem((i) => i.setTitle(`Farbe für „${thema}“ …`).setIcon("palette").onClick(() => new FarbModal(this.plugin, kategorie, thema).open()));
    if (this.plugin.settings.anzeige.themaFarben[farbSchluessel(kategorie, thema)]) {
      menu.addItem((i) => i.setTitle("Farbe zurücksetzen").setIcon("rotate-ccw").onClick(() => void setzeThemaFarbe(this.plugin, kategorie, thema, null)));
    }
    menu.showAtMouseEvent(e);
  }
}

/** Themenfarbe speichern (null = zurück auf die Standardfarbe). */
export async function setzeThemaFarbe(p: SchulTagesnotesPlugin, kategorie: string, thema: string, farbe: string | null): Promise<void> {
  const farben = { ...p.settings.anzeige.themaFarben };
  const key = farbSchluessel(kategorie, thema);
  const n = farbe ? normalisiereFarbe(farbe) : null;
  if (n) farben[key] = n;
  else delete farben[key];
  await p.anzeige.set("themaFarben", farben);
}

/** Farbwahl für ein Thema: Vorschläge, freier Farbwähler, Zurücksetzen. */
export class FarbModal extends Modal {
  private p: SchulTagesnotesPlugin;
  private kategorie: string;
  private thema: string;

  constructor(p: SchulTagesnotesPlugin, kategorie: string, thema: string) {
    super(p.app);
    this.p = p;
    this.kategorie = kategorie;
    this.thema = thema;
  }

  onOpen(): void {
    this.modalEl.addClass("schul-farb-modal");
    this.titleEl.setText(`Farbe für „${this.thema}“`);
    const aktuell = themaFarbe(this.p.settings.anzeige, this.kategorie, this.thema) ?? "#7c5cff";
    const leiste = this.contentEl.createDiv({ cls: "schul-farben" });
    for (const f of FARB_VORSCHLAEGE) {
      const b = leiste.createEl("button", { cls: "schul-farbe", attr: { "aria-label": f } });
      b.style.setProperty("--schul-farbe", f);
      b.toggleClass("is-active", f === aktuell);
      b.addEventListener("click", () => void this.waehle(f));
    }
    new Setting(this.contentEl)
      .setName("Eigene Farbe")
      .addColorPicker((c) => c.setValue(aktuell).onChange((v) => void this.waehle(v, false)))
      .addButton((b) => b.setButtonText("Zurücksetzen").onClick(() => void this.waehle(null)));
  }

  private async waehle(farbe: string | null, schliessen = true): Promise<void> {
    await setzeThemaFarbe(this.p, this.kategorie, this.thema, farbe);
    if (schliessen) this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
