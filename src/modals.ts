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
  | { kind: "new"; name: string }
  | { kind: "open"; path: string };

/** Vorhandene Note an einem Tag (für „schon da“). */
export interface NoteAmTag {
  path: string;
  basename: string;
  thema: string | null;
}

/** Zusatzangaben für den Themen-Dialog; alles hängt vom gewählten Datum ab. */
export interface ThemaKontext {
  /** Startdatum (YYYY-MM-DD) */
  datum: string;
  heute: string;
  /** Halbjahr bzw. Jahr zum Datum, z. B. "13-1" */
  zeitraum?: (datum: string) => string;
  /** Notes der Kategorie an diesem Tag */
  vorhanden?: (datum: string) => NoteAmTag[];
  /** Ziel der neuen Note relativ zur Kategorie, z. B. "13-1/Geraden/2026-10-17 Mathe (2)" */
  ziel?: (thema: string | null, datum: string) => string;
  /** Datumsfeld beim Öffnen fokussieren */
  datumFokus?: boolean;
  /** Tag verschieben (für Alt+←/→) */
  verschiebe?: (datum: string, tage: number) => string;
}

/**
 * Schritt 2: Datum wählen (Standard heute), vorhandene Notes des Tages öffnen oder ein Thema wählen –
 * zuletzt benutzte zuerst, „ohne Thema“ oder ein neues Thema aus der Eingabe.
 */
export class ThemaModal extends SuggestModal<ThemaChoice> {
  private info = new Map<string, ThemaInfo>();
  private themen: string[];
  private datum: string;
  private dateInput!: HTMLInputElement;
  private zeitraumEl!: HTMLElement;

  constructor(
    app: App,
    private fach: Fach,
    themen: (string | ThemaInfo)[],
    private onPick: (choice: ThemaChoice, datum: string) => void,
    private allowNone = true,
    private kontext: ThemaKontext = { datum: "", heute: "" },
  ) {
    super(app);
    this.datum = kontext.datum;
    this.themen = themen.map((t) => (typeof t === "string" ? t : t.name));
    for (const t of themen) if (typeof t !== "string") this.info.set(t.name, t);
    this.modalEl.addClass("schul-modal");
    this.setPlaceholder(`Thema für ${fach.name} – tippen für ein neues Thema`);
    this.setInstructions([
      { command: "↑↓", purpose: "wählen" },
      { command: "↵", purpose: "anlegen bzw. öffnen" },
      { command: "Alt ←/→", purpose: "Tag zurück/vor" },
      { command: "Ctrl D", purpose: "Datum eingeben" },
      { command: "esc", purpose: "abbrechen" },
    ]);
    if (this.datum) this.buildDateBar();
  }

  private buildDateBar(): void {
    const bar = createDiv({ cls: "schul-datebar" });
    const btn = (icon: string, label: string, fn: () => void) => {
      const b = bar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
      setIcon(b, icon);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        fn();
      });
    };
    bar.createSpan({ cls: "schul-datebar-fach", text: this.fach.name });
    btn("chevron-left", "Tag zurück (Alt+←)", () => this.shift(-1));
    this.dateInput = bar.createEl("input", { type: "date", cls: "schul-datebar-input" });
    this.dateInput.value = this.datum;
    this.dateInput.addEventListener("change", () => this.setDatum(this.dateInput.value));
    this.dateInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.inputEl.focus();
      }
    });
    btn("chevron-right", "Tag vor (Alt+→)", () => this.shift(1));
    const heute = bar.createEl("button", { cls: "schul-datebar-heute", text: "Heute" });
    heute.addEventListener("click", (e) => {
      e.preventDefault();
      this.setDatum(this.kontext.heute);
    });
    this.zeitraumEl = bar.createSpan({ cls: "schul-badge" });
    this.modalEl.prepend(bar);
    this.scope.register(["Alt"], "ArrowLeft", () => (this.shift(-1), false));
    this.scope.register(["Alt"], "ArrowRight", () => (this.shift(1), false));
    this.scope.register(["Mod"], "d", () => (this.dateInput.focus(), false));
    this.updateZeitraum();
  }

  onOpen(): void {
    super.onOpen();
    if (this.kontext.datumFokus && this.dateInput) window.setTimeout(() => this.dateInput.focus(), 0);
  }

  private shift(tage: number): void {
    if (this.kontext.verschiebe) this.setDatum(this.kontext.verschiebe(this.datum, tage));
  }

  private setDatum(datum: string): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return;
    this.datum = datum;
    if (this.dateInput) this.dateInput.value = datum;
    this.updateZeitraum();
    // Vorschläge neu berechnen
    this.inputEl.dispatchEvent(new Event("input"));
  }

  private updateZeitraum(): void {
    if (!this.zeitraumEl) return;
    const z = this.kontext.zeitraum?.(this.datum) ?? "";
    this.zeitraumEl.setText(this.datum === this.kontext.heute ? `${z} · heute` : z);
  }

  getSuggestions(query: string): ThemaChoice[] {
    const q = query.trim();
    const lower = q.toLowerCase();
    const da: ThemaChoice[] = (this.kontext.vorhanden?.(this.datum) ?? [])
      .filter((n) => !q || n.basename.toLowerCase().includes(lower) || (n.thema ?? "").toLowerCase().includes(lower))
      .map((n) => ({ kind: "open", path: n.path }));
    const hits: ThemaChoice[] = this.themen
      .filter((t) => t.toLowerCase().includes(lower))
      .map((name) => ({ kind: "existing", name }));
    const exact = this.themen.some((t) => t.toLowerCase() === lower);
    if (q && !exact) hits.push({ kind: "new", name: q });
    if (!q && this.allowNone) hits.unshift({ kind: "none" });
    return [...da, ...hits];
  }

  renderSuggestion(choice: ThemaChoice, el: HTMLElement): void {
    const ziel = (t: string | null) => (this.kontext.ziel ? `→ ${this.kontext.ziel(t, this.datum)}` : "");
    if (choice.kind === "open") {
      const n = this.kontext.vorhanden?.(this.datum).find((x) => x.path === choice.path);
      el.addClass("schul-suggestion-vorhanden");
      return renderRow(el, "file-check", n?.basename ?? choice.path, n?.thema ? `Thema: ${n.thema}` : "ohne Thema", "öffnen", "schon da");
    }
    if (choice.kind === "none") return renderRow(el, "circle-dashed", "Ohne Thema", "", ziel(null));
    if (choice.kind === "new") return renderRow(el, "plus", `Neues Thema: ${choice.name}`, "", ziel(choice.name));
    const i = this.info.get(choice.name);
    const sub = i?.anzahl ? `${i.anzahl} Note${i.anzahl === 1 ? "" : "s"}${i.zuletzt ? ` · zuletzt ${kurzDatum(i.zuletzt, this.kontext.heute)}` : ""}` : "";
    renderRow(el, i?.zuletzt ? "history" : "file-text", choice.name, sub, ziel(choice.name));
  }

  onChooseSuggestion(choice: ThemaChoice): void {
    this.onPick(choice, this.datum);
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
