// Notes ohne Datumsmarken an Überschriften aufteilen (pure).
import { trimBlock } from "./dates.ts";

export interface HeadingPart {
  /** Überschrift, mit der der Teil beginnt (ohne #); null = Vorspann ohne Überschrift. */
  heading: string | null;
  level: number;
  text: string;
  /** Alle Link-Ziele in diesem Teil: Überschriften (beliebige Ebene) und Block-IDs (^id). */
  anchors: string[];
}

export interface SplitOptions {
  /** Bis zu dieser Ebene wird geteilt (2 = an # und ##). */
  maxLevel: number;
  /** Teile mit weniger Zeichen werden an den vorigen Teil angehängt. */
  minLen: number;
}

/** Überschrift für Vergleiche wie Obsidian: ohne Formatierung, Leerraum zusammengefasst, Kleinschreibung. */
export function headingKey(h: string): string {
  return h
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/[*_`=]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function anchorsOf(text: string): string[] {
  const out: string[] = [];
  let inCode = false;
  for (const l of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
    if (inCode) continue;
    const h = HEADING.exec(l);
    if (h) out.push(headingKey(h[2]));
    const b = /\s\^([A-Za-z0-9-]+)\s*$/.exec(l);
    if (b) out.push(`^${b[1]}`);
  }
  return out;
}

/**
 * Teilt an Überschriften bis `maxLevel` (außerhalb von Codeblöcken). Ein Vorspann ohne Überschrift wird eigener Teil,
 * wenn er lang genug ist, sonst kommt er zum ersten Teil. Zu kurze Teile werden an den vorigen angehängt.
 */
export function splitHeadings(body: string, opts: SplitOptions): HeadingPart[] {
  const lines = body.split("\n");
  const raw: { heading: string | null; level: number; lines: string[] }[] = [{ heading: null, level: 0, lines: [] }];
  let inCode = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
    const h = inCode ? null : HEADING.exec(l);
    if (h && h[1].length <= opts.maxLevel) raw.push({ heading: h[2].trim(), level: h[1].length, lines: [l] });
    else raw[raw.length - 1].lines.push(l);
  }
  const parts: HeadingPart[] = [];
  let pendingPreamble = "";
  for (const r of raw) {
    const text = trimBlock(r.lines.join("\n"));
    if (!text) continue;
    if (r.heading === null) {
      // Vorspann: eigener Teil, wenn lang genug, sonst vor den ersten Teil
      if (text.length >= opts.minLen) parts.push({ heading: null, level: 0, text, anchors: anchorsOf(text) });
      else pendingPreamble = text;
      continue;
    }
    const full = pendingPreamble ? `${pendingPreamble}\n\n${text}` : text;
    pendingPreamble = "";
    // Nur Überschrift ohne Inhalt oder zu kurz → an den vorigen Teil
    if (parts.length && full.length < opts.minLen) {
      const prev = parts[parts.length - 1];
      prev.text = `${prev.text}\n\n${full}`;
      prev.anchors = anchorsOf(prev.text);
      continue;
    }
    parts.push({ heading: r.heading, level: r.level, text: full, anchors: anchorsOf(full) });
  }
  if (pendingPreamble) parts.push({ heading: null, level: 0, text: pendingPreamble, anchors: anchorsOf(pendingPreamble) });
  // Ein zu kurzer erster Teil (z. B. nur "# Titel") geht in den zweiten auf
  if (parts.length > 1 && parts[0].text.length < opts.minLen) {
    const [a, b] = parts;
    parts.splice(0, 2, { heading: a.heading ?? b.heading, level: a.heading ? a.level : b.level, text: `${a.text}\n\n${b.text}`, anchors: anchorsOf(`${a.text}\n\n${b.text}`) });
  }
  return parts;
}

/** Überschriften der Ebene 3 (für `unterthemen`), ohne Formatierung. */
export function h3Headings(text: string): string[] {
  const out: string[] = [];
  let inCode = false;
  for (const l of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
    if (inCode) continue;
    const m = /^###\s+(.+?)\s*#*\s*$/.exec(l);
    if (m) out.push(m[1].replace(/[*_`=]/g, "").trim());
  }
  return out;
}
