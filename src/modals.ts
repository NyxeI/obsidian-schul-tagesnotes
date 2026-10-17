import { App, FuzzySuggestModal, Modal, Setting, SuggestModal, setIcon } from "obsidian";
import type { Fach, PathConfig } from "./config.ts";
import { kurzDatum, type ThemaInfo } from "./themen.ts";

/** Auswahl einer Kategorie (Fach, Projekt) samt Bereich; `zuletzt`/`anzahl` = Tagesnotes. */
export interface KategorieWahl {
  cfg: PathConfig;
  fach: Fach;
  zuletzt?: string;
  anzahl?: number;
}

/** Icon je Bereich (Lucide). */
function bereichIcon(cfg: PathConfig): string {
  return cfg.id === "schule" ? "graduation-cap" : cfg.id === "projekte" ? "folder-kanban" : "folder";
}

/** Zeile im Dialog: Icon | Titel + Nebenzeile | rechts Hinweis. */
function renderRow(el: HTMLElement, icon: string, title: string, sub: string, aside = "", badge = ""): void {
  el.addClass("schul-suggestion");
  setIcon(el.createDiv({ cls: "schul-suggestion-icon" }), icon);
  const main = el.createDiv({ cls: "schul-suggestion-main" });
  const head = main.createDiv({ cls: "schul-suggestion-title", text: title });
  if (badge) head.createSpan({ cls: "schul-badge", text: badge });
  if (sub) main.createDiv({ cls: "schul-suggestion-sub", text: sub });
  if (aside) el.createDiv({ cls: "schul-suggestion-aside", text: aside });
}

/** Schritt 1: Fach oder Projekt wählen – zuletzt benutzte oben. */
export class FachModal extends SuggestModal<KategorieWahl> {
  constructor(app: App, private items: KategorieWahl[], private onPick: (wahl: KategorieWahl) => void, private heute = "") {
    super(app);
    this.modalEl.addClass("schul-modal");
    this.setPlaceholder("Neue Tagesnote – Fach oder Projekt …");
    this.setInstructions([
      { command: "↑↓", purpose: "wählen" },
      { command: "↵", purpose: "weiter zum Thema" },
      { command: "esc", purpose: "abbrechen" },
    ]);
    this.limit = 50;
  }

  getSuggestions(query: string): KategorieWahl[] {
    const q = query.trim().toLowerCase();
    if (!q) return this.items;
    const hits = this.items.filter((i) => i.fach.name.toLowerCase().includes(q) || i.cfg.name.toLowerCase().includes(q));
    // Treffer am Wortanfang zuerst ("ma" → Mathe vor Informatik)
    return hits.sort((a, b) => Number(!a.fach.name.toLowerCase().startsWith(q)) - Number(!b.fach.name.toLowerCase().startsWith(q)));
  }

  renderSuggestion(item: KategorieWahl, el: HTMLElement): void {
    const sub = item.anzahl ? `${item.anzahl} Tagesnote${item.anzahl === 1 ? "" : "s"}` : "noch keine Tagesnotes";
    const aside = item.zuletzt ? `zuletzt ${kurzDatum(item.zuletzt, this.heute)}` : "";
    renderRow(el, bereichIcon(item.cfg), item.fach.name, sub, aside, item.cfg.name);
  }

  onChooseSuggestion(item: KategorieWahl): void {
    this.onPick(item);
  }
}

export class BereichModal extends FuzzySuggestModal<PathConfig> {
  constructor(app: App, private bereiche: PathConfig[], private onPick: (cfg: PathConfig) => void) {
    super(app);
    this.setPlaceholder("Bereich wählen …");
  }

  getItems(): PathConfig[] {
    return this.bereiche;
  }

  getItemText(item: PathConfig): string {
    return `${item.name} (${item.root})`;
  }

  onChooseItem(item: PathConfig): void {
    this.onPick(item);
  }
}

export type ThemaChoice =
  | { kind: "none" }
  | { kind: "existing"; name: string }
  | { kind: "new"; name: string };

/** Zusatzangaben für den Themen-Dialog. */
export interface ThemaKontext {
  /** z. B. "13-1" oder "2026" */
  zeitraum?: string;
  /** Heute gibt es schon eine Tagesnote in diesem Fach (sie wird geöffnet, das Thema angehängt). */
  heuteVorhanden?: boolean;
  heute?: string;
  /** Ordner der neuen Tagesnote je Thema (null = ohne Thema), relativ zum Fach. */
  ordner?: (thema: string | null) => string;
}

/** Schritt 2: Thema wählen – zuletzt benutzte zuerst, „ohne Thema“ oder neues Thema aus der Eingabe. */
export class ThemaModal extends SuggestModal<ThemaChoice> {
  private info = new Map<string, ThemaInfo>();
  private themen: string[];

  constructor(
    app: App,
    private fach: Fach,
    themen: (string | ThemaInfo)[],
    private onPick: (choice: ThemaChoice) => void,
    private allowNone = true,
    private kontext: ThemaKontext = {},
  ) {
    super(app);
    this.themen = themen.map((t) => (typeof t === "string" ? t : t.name));
    for (const t of themen) if (typeof t !== "string") this.info.set(t.name, t);
    this.modalEl.addClass("schul-modal");
    const wo = [fach.name, kontext.zeitraum].filter(Boolean).join(" · ");
    this.setPlaceholder(`Thema für ${wo} – tippen für ein neues Thema`);
    this.setInstructions([
      { command: "↑↓", purpose: "wählen" },
      { command: "↵", purpose: "anlegen bzw. öffnen" },
      { command: "esc", purpose: "abbrechen" },
    ]);
    if (kontext.heuteVorhanden) {
      const hint = this.modalEl.createDiv({ cls: "schul-modal-hint" });
      setIcon(hint.createSpan(), "info");
      hint.createSpan({ text: ` Heute gibt es schon Notes in ${fach.name}: gleiches Thema öffnet die vorhandene, ein neues Thema legt eine weitere an.` });
      this.modalEl.insertBefore(hint, this.modalEl.firstChild);
    }
  }

  getSuggestions(query: string): ThemaChoice[] {
    const q = query.trim();
    const lower = q.toLowerCase();
    const hits: ThemaChoice[] = this.themen
      .filter((t) => t.toLowerCase().includes(lower))
      .map((name) => ({ kind: "existing", name }));
    const exact = this.themen.some((t) => t.toLowerCase() === lower);
    if (q && !exact) hits.push({ kind: "new", name: q });
    if (!q && this.allowNone) hits.unshift({ kind: "none" });
    return hits;
  }

  renderSuggestion(choice: ThemaChoice, el: HTMLElement): void {
    const ordner = (t: string | null) => (this.kontext.ordner ? `→ ${this.kontext.ordner(t)}` : "");
    if (choice.kind === "none") return renderRow(el, "circle-dashed", "Ohne Thema", "", ordner(null));
    if (choice.kind === "new") return renderRow(el, "plus", `Neues Thema: ${choice.name}`, "", ordner(choice.name));
    const i = this.info.get(choice.name);
    const sub = i?.anzahl ? `${i.anzahl} Note${i.anzahl === 1 ? "" : "s"}` : "";
    const aside = i?.zuletzt ? `zuletzt ${kurzDatum(i.zuletzt, this.kontext.heute ?? "")}` : "";
    renderRow(el, i?.zuletzt ? "history" : "file-text", choice.name, sub, aside);
  }

  onChooseSuggestion(choice: ThemaChoice): void {
    this.onPick(choice);
  }
}

export class ListModal extends FuzzySuggestModal<string> {
  constructor(app: App, private items: string[], placeholder: string, private onPick: (item: string) => void) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): string[] {
    return this.items;
  }

  getItemText(item: string): string {
    return item;
  }

  onChooseItem(item: string): void {
    this.onPick(item);
  }
}

/** Einzeiliges Texteingabe-Fenster (Enter bestätigt). */
export class TextModal extends Modal {
  private value = "";

  constructor(app: App, private heading: string, private onSubmit: (value: string) => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    const submit = () => {
      this.close();
      this.onSubmit(this.value);
    };
    new Setting(this.contentEl).addText((t) => {
      t.onChange((v) => (this.value = v));
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });
    new Setting(this.contentEl).addButton((b) => b.setButtonText("Anlegen").setCta().onClick(submit));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
