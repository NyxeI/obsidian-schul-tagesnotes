import { App, FuzzySuggestModal, SuggestModal } from "obsidian";
import type { Fach } from "./config.ts";

export class FachModal extends FuzzySuggestModal<Fach> {
  constructor(app: App, private faecher: Fach[], private onPick: (fach: Fach) => void) {
    super(app);
    this.setPlaceholder("Fach wählen …");
  }

  getItems(): Fach[] {
    return this.faecher;
  }

  getItemText(item: Fach): string {
    return item.name;
  }

  onChooseItem(item: Fach): void {
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
