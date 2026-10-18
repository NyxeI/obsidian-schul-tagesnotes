// Alle Base-Dateien des Plugins an einer Stelle – für „Templates und Base anlegen“ und „Base-Dateien auf Plugin-Stand bringen“.
import type { AnzeigeSettings } from "./ansicht.ts";
import { pathConfig, type SchulSettings } from "./defaults.ts";
import { setzeTabellen, tabellenBreite, type BaseDatei } from "./spalten.ts";
import {
  addBegriffeToKategorieBase,
  bereichBase,
  DEFAULT_INBOX_BASE,
  DEFAULT_JOURNAL_BASE,
  kategorieBase,
  tagBase,
} from "./templates.ts";

/** Pfad → Inhalt aller Bases; `dailyFormat` = Datumsformat der Daily Notes (für Tag.base). */
export function pluginBases(s: SchulSettings, dailyFormat = "YYYY-MM-DD"): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of s.bereiche) {
    const cfg = pathConfig(s, b);
    // Seit Migration v2 gibt es keine Themen-Hubs mehr: nur noch die Base des Kategorie-Hubs.
    out.set(cfg.kategorieBasePath, addBegriffeToKategorieBase(kategorieBase(cfg.property, cfg.zeitraum)));
  }
  out.set(s.bereichBasePath, bereichBase(s.bereiche.filter((b) => b.hubPath).map((b) => ({ name: b.name, property: b.property, root: b.root }))));
  out.set(s.journal.basePath, DEFAULT_JOURNAL_BASE);
  out.set(s.inboxBasePath, DEFAULT_INBOX_BASE);
  out.set(s.tagBasePath, tagBase(dailyFormat));
  return out;
}

/** Pfade der Kategorie-Bases – nur diese ändert das Panel (Spalten, Zeilenhöhe, Breite). */
export function kategorieBasePfade(s: SchulSettings): Set<string> {
  return new Set(s.bereiche.map((b) => pathConfig(s, b).kategorieBasePath));
}

/** YAML-Parser von außen (in Obsidian `parseYaml`/`stringifyYaml`), damit das Modul ohne Obsidian testbar bleibt. */
export interface Yaml {
  parse(text: string): unknown;
  stringify(obj: unknown): string;
}

/** Darstellungsfelder einer Ansicht, die das Panel in die Base schreibt. */
const ANZEIGE_FELDER = ["order", "columnSize", "rowHeight"] as const;

const KOPF = /^(?:#[^\n]*\n)+/;

function parse(text: string, yaml: Yaml): BaseDatei | null {
  try {
    const o = yaml.parse(text.replace(KOPF, ""));
    return o && typeof o === "object" ? (o as BaseDatei) : {};
  } catch {
    return null;
  }
}

/**
 * Soll-Inhalt einer Kategorie-Base mit den Panel-Einstellungen: Zeilenhöhe/Breite aus `anzeige`,
 * pro Ansicht (gleicher Name) gewinnen `order`, `columnSize` und `rowHeight` der vorhandenen Datei –
 * auch wenn das Plugin inzwischen andere Spalten vorsieht. Kopfkommentare des Solls bleiben;
 * Kommentare im Rumpf gehen durch `stringify` verloren (nur wenn sich überhaupt etwas ändert).
 */
export function mitAnzeige(
  soll: string,
  ist: string | null,
  anzeige: Pick<AnzeigeSettings, "zeilenhoehe" | "volleBreite">,
  yaml: Yaml,
): string {
  const base = parse(soll, yaml);
  if (!base) return soll;
  const vorher = JSON.stringify(base);
  setzeTabellen(base, anzeige.zeilenhoehe, tabellenBreite(anzeige.volleBreite));
  const alt = ist === null ? null : parse(ist, yaml);
  for (const v of base.views ?? []) {
    const a = alt?.views?.find((x) => x.name === v.name);
    if (!a) continue;
    for (const k of ANZEIGE_FELDER) {
      if (a[k] === undefined) delete v[k];
      else v[k] = structuredClone(a[k]) as never;
    }
  }
  if (JSON.stringify(base) === vorher) return soll;
  return (KOPF.exec(soll) ?? [""])[0] + yaml.stringify(base);
}

/** Inhaltlich gleich (geparst, ohne Kommentare und Formatierung)? Nicht lesbares YAML gilt als verschieden. */
export function gleicheBase(a: string, b: string, yaml: Yaml): boolean {
  const pa = parse(a, yaml);
  const pb = parse(b, yaml);
  return pa !== null && pb !== null && tiefGleich(pa, pb);
}

function tiefGleich(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => k in b && tiefGleich((a as any)[k], (b as any)[k]));
}

/**
 * Veraltete Bases: Pfad → neuer Inhalt. `ist` = aktueller Dateiinhalt je Pfad (null = fehlt).
 * Kategorie-Bases behalten die Panel-Einstellungen; veraltet ist nur, was inhaltlich abweicht.
 */
export function veralteteBases(
  soll: Map<string, string>,
  ist: Map<string, string | null>,
  kategorie: Set<string>,
  anzeige: Pick<AnzeigeSettings, "zeilenhoehe" | "volleBreite">,
  yaml: Yaml,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [pfad, inhalt] of soll) {
    const alt = ist.get(pfad) ?? null;
    const neu = kategorie.has(pfad) ? mitAnzeige(inhalt, alt, anzeige, yaml) : inhalt;
    if (alt === null || !gleicheBase(alt, neu, yaml)) out.set(pfad, neu);
  }
  return out;
}
