// Spalten und Breiten der Plugin-Bases (pure): Tabellen sollen in die Notizbreite passen statt seitlich zu scrollen.

/** Spalten, die im Panel ein-/ausgeschaltet werden können (Property-Name wie in `order`). */
export const SPALTEN: { name: string; label: string; art: "text" | "liste" | "schmal" }[] = [
  { name: "thema", label: "Thema", art: "text" },
  { name: "abschnitt", label: "Abschnitt", art: "text" },
  { name: "unterthemen", label: "Unterthemen", art: "liste" },
  { name: "file.tags", label: "Tags", art: "liste" },
  { name: "kapitel", label: "Kapitel", art: "text" },
  { name: "datum", label: "Datum", art: "schmal" },
  { name: "halbjahr", label: "Halbjahr", art: "schmal" },
];

/** Breite der Note-Spalte (Dateiname "2026-10-17 Deutsch (3)"). */
const NAME_BREITE = 175;
const SCHMAL = 125;
const GEWICHT = { text: 1, liste: 1.4 } as const;

/** Property-ID wie in `columnSize`: "file.name" bleibt, sonst "note.<name>". */
export function spaltenId(name: string): string {
  return name.startsWith("file.") || name.startsWith("note.") || name.startsWith("formula.") ? name : `note.${name}`;
}

/** Breiten für die Spalten einer Ansicht, Summe ≤ `gesamt`. Listen-Spalten bekommen mehr Platz. */
export function spaltenBreiten(order: string[], gesamt: number): Record<string, number> {
  const out: Record<string, number> = {};
  let rest = gesamt;
  const flexibel: { id: string; gewicht: number }[] = [];
  for (const name of order) {
    const id = spaltenId(name);
    const art = SPALTEN.find((s) => s.name === name)?.art ?? (name === "file.name" ? "name" : "text");
    if (art === "name") {
      out[id] = NAME_BREITE;
      rest -= NAME_BREITE;
    } else if (art === "schmal") {
      out[id] = SCHMAL;
      rest -= SCHMAL;
    } else flexibel.push({ id, gewicht: GEWICHT[art] });
  }
  const summe = flexibel.reduce((a, f) => a + f.gewicht, 0);
  for (const f of flexibel) out[f.id] = Math.max(90, Math.floor((rest * f.gewicht) / summe));
  return out;
}

export interface BaseView {
  name?: string;
  type?: string;
  order?: string[];
  columnSize?: Record<string, number>;
  rowHeight?: string;
  [k: string]: unknown;
}

export interface BaseDatei {
  views?: BaseView[];
  [k: string]: unknown;
}

/** Spalten einer Ansicht setzen (file.name bleibt immer vorne) und Breiten neu berechnen. */
export function setzeSpalten(base: BaseDatei, ansicht: string, spalten: string[], gesamt: number): boolean {
  const v = base.views?.find((x) => x.name === ansicht);
  if (!v) return false;
  v.order = ["file.name", ...spalten.filter((s) => s !== "file.name")];
  if (v.type === "table" || v.type === undefined) v.columnSize = spaltenBreiten(v.order, gesamt);
  return true;
}

/** Alle Tabellen-Ansichten: Zeilenhöhe setzen und Breiten für `gesamt` neu berechnen. */
export function setzeTabellen(base: BaseDatei, zeilenhoehe: string, gesamt: number): void {
  for (const v of base.views ?? []) {
    if (v.type !== "table") continue;
    if (zeilenhoehe) v.rowHeight = zeilenhoehe;
    else delete v.rowHeight;
    if (v.order) v.columnSize = spaltenBreiten(v.order, gesamt);
  }
}

/** Breite, für die die Tabellen bemessen werden. */
export function tabellenBreite(volleBreite: boolean): number {
  return volleBreite ? 1100 : 690;
}
