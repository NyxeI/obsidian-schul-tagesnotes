// Anzeige-Schalter, Art der aktiven Note, Navigation im Thema und Hub-Kennzahlen (pure).
import type { Fach, PathConfig } from "./config.ts";
import { findFach, linkTarget, normalizeDate, suffixNumber, themaOf } from "./paths.ts";
import type { NoteInfo } from "./themen.ts";

export interface AnzeigeSettings {
  /** Kompakte Plugin-Bases (Toolbar/Rahmen) */
  kompakt: boolean;
  /** TaskNotes-Widget (Subtasks/Relationships) in Fach- und Projekt-Hubs zeigen */
  tasknotesInHubs: boolean;
  /** Properties-Block in datierten Notes zeigen */
  propertiesInNotes: boolean;
  /** Menüleiste oben in Hubs und datierten Notes */
  menueleiste: boolean;
}

export const DEFAULT_ANZEIGE: AnzeigeSettings = { kompakt: true, tasknotesInHubs: false, propertiesInNotes: true, menueleiste: true };

/** Klassen am <body>, die styles.css auswertet. */
export function bodyClasses(a: AnzeigeSettings): Record<string, boolean> {
  return {
    "schul-kompakt": a.kompakt,
    "schul-tn-aus": !a.tasknotesInHubs,
    "schul-props-aus": !a.propertiesInNotes,
  };
}

export type NoteArt = "hub" | "note" | null;

/** Hub = typ ist die Kategorie-Property eines Bereichs (fach, projekt); note = datierte Note. */
export function noteArt(fm: Record<string, unknown> | null | undefined, properties: string[]): NoteArt {
  const typ = fm?.typ;
  if (typeof typ !== "string") return null;
  if (typ === "tagesnote") return "note";
  return properties.includes(typ) ? "hub" : null;
}

/** YYYY-MM-DD um `tage` verschieben (lokal, ohne Zeitzonen-Sprünge). */
export function shiftDate(datum: string, tage: number): string {
  const [y, m, d] = datum.split("-").map(Number);
  const dt = new Date(y, m - 1, d + tage);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

interface Eintrag {
  path: string;
  datum: string;
  n: number;
}

/** Datierte Notes derselben Kategorie, sortiert nach Datum und Nummer " (n)". */
function sortiert(notes: NoteInfo[], cfg: PathConfig, fach: Fach, filter: (fm: Record<string, unknown>) => boolean): Eintrag[] {
  const out: Eintrag[] = [];
  for (const n of notes) {
    const fm = n.fm ?? {};
    if (fm.typ !== "tagesnote" || !filter(fm)) continue;
    if (findFach(linkTarget(fm[cfg.property]), cfg.kategorien) !== fach) continue;
    const datum = normalizeDate(fm.datum) ?? "";
    const base = n.basename.replace(/ \(\d+\)$/, "");
    out.push({ path: n.path, datum, n: suffixNumber(n.basename, base) ?? 1 });
  }
  return out.sort((a, b) => a.datum.localeCompare(b.datum) || a.n - b.n || a.path.localeCompare(b.path));
}

/** Vorige und nächste Note im selben Thema (und derselben Kategorie). */
export function nachbarnImThema(notes: NoteInfo[], cfg: PathConfig, current: NoteInfo): { prev: string | null; next: string | null; pos: number; von: number } {
  const fm = current.fm ?? {};
  const fach = findFach(linkTarget(fm[cfg.property]), cfg.kategorien);
  const thema = themaOf(fm)[0] ?? null;
  if (!fach) return { prev: null, next: null, pos: 0, von: 0 };
  const list = sortiert(notes, cfg, fach, (x) => (themaOf(x)[0] ?? null) === thema);
  const i = list.findIndex((e) => e.path === current.path);
  return { prev: i > 0 ? list[i - 1].path : null, next: i >= 0 && i < list.length - 1 ? list[i + 1].path : null, pos: i + 1, von: list.length };
}

export interface HubStats {
  notes: number;
  themen: number;
  geschaetzt: number;
  erste: string;
  letzte: string;
}

/** Kennzahlen eines Kategorie-Hubs. */
export function hubStats(notes: NoteInfo[], cfg: PathConfig, fach: Fach): HubStats {
  const list = sortiert(notes, cfg, fach, () => true);
  const inList = new Set(list.map((e) => e.path));
  const themen = new Set<string>();
  let geschaetzt = 0;
  for (const n of notes) {
    if (!inList.has(n.path)) continue;
    const t = themaOf(n.fm)[0];
    if (t) themen.add(t);
    if (n.fm?.datum_geschaetzt === true) geschaetzt++;
  }
  return { notes: list.length, themen: themen.size, geschaetzt, erste: list[0]?.datum ?? "", letzte: list[list.length - 1]?.datum ?? "" };
}

/** Datierte Notes einer Kategorie an einem Tag (für den Dialog „schon da“). */
export function notesAmTag(notes: NoteInfo[], cfg: PathConfig, fach: Fach, datum: string): { path: string; basename: string; thema: string | null }[] {
  return sortiert(notes, cfg, fach, (fm) => normalizeDate(fm.datum) === datum).map((e) => {
    const n = notes.find((x) => x.path === e.path)!;
    return { path: e.path, basename: n.basename, thema: themaOf(n.fm)[0] ?? null };
  });
}
