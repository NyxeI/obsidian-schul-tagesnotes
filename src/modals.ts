import { App, FuzzySuggestModal, Modal, Setting, SuggestModal } from "obsidian";
import type { Fach, PathConfig } from "./config.ts";

/** Auswahl einer Kategorie (Fach, Projekt) samt Bereich. */
export interface KategorieWahl {
  cfg: PathConfig;
  fach: Fach;
}

export class FachModal extends FuzzySuggestModal<KategorieWahl> {
  constructor(app: App, private items: KategorieWahl[], private onPick: (wahl: KategorieWahl) => void) {
    super(app);
    this.setPlaceholder("Fach oder Projekt wählen …");
  }

  getItems(): KategorieWahl[] {
    return this.items;
  }

  getItemText(item: KategorieWahl): string {
    return `${item.fach.name} · ${item.cfg.name}`;
  }

  onChooseItem(item: KategorieWahl): void {
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

/** Themenwahl: vorhandene Themen (zuletzt benutzte zuerst), „ohne Thema“ oder neues Thema aus der Eingabe. */
export class ThemaModal extends SuggestModal<ThemaChoice> {
  constructor(
    app: App,
    fach: Fach,
    private themen: string[],
    private onPick: (choice: ThemaChoice) => void,
    private allowNone = true,
  ) {
    super(app);
    this.setPlaceholder(`Thema für ${fach.name} – tippen für neues Thema`);
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
    if (choice.kind === "none") el.setText("Ohne Thema");
    else if (choice.kind === "new") el.setText(`Neues Thema: ${choice.name}`);
    else el.setText(choice.name);
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
