// Datumsmarken in alten Themen-Notes erkennen und Notes daran aufteilen (pure).

const WOCHENTAG = "(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)";

/**
 * Eine Zeile gilt als Datumsmarke, wenn sie NUR aus einem Datum besteht, optional mit
 * Überschrift (#), Fettdruck (**), Wochentag davor oder Wochentag-Kürzel dahinter:
 *   "16-09-2026", "8.5.2026", "## 07.10.25", "## Montag 12.03.2026", "### 12.03.26 - Mi", "**02-10-2026**"
 * Zeilen mit weiterem Text ("## Dienstag, 2.12.25; 5. + 6. Stunde; Aula") sind KEINE Marke.
 */
const MARKER = new RegExp(
  `^\\s*(?:#{1,6}\\s+)?(?:\\*\\*)?(?:${WOCHENTAG}\\.?,?\\s+)?` +
    `(\\d{1,2})[.-](\\d{1,2})[.-](\\d{4}|\\d{2})` +
    `(?:\\s*[-–]\\s*${WOCHENTAG}\\.?)?(?:\\*\\*)?\\s*$`,
);

/** Datumsmarke → YYYY-MM-DD, sonst null (auch bei ungültigem Datum wie 31.02.). */
export function parseMarker(line: string): string | null {
  const m = line.match(MARKER);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${year}-${p(month)}-${p(day)}`;
}

export interface Section {
  datum: string;
  /** Originalzeile der Marke (für den Bericht). */
  marker: string;
  /** 1-basierte Zeilennummer der Marke im Body. */
  line: number;
  body: string;
}

export interface SplitResult {
  /** Text vor der ersten Marke (bleibt im Themen-Hub). */
  preamble: string;
  sections: Section[];
}

/** Entfernt führende/abschließende Leerzeilen und Trennlinien "---". */
export function trimBlock(text: string): string {
  const lines = text.split("\n");
  const isFiller = (l: string) => l.trim() === "" || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l);
  while (lines.length && isFiller(lines[0])) lines.shift();
  while (lines.length && isFiller(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
}

/** Teilt einen Note-Body (ohne Frontmatter) an Datumsmarken. Marken in Codeblöcken zählen nicht. */
export function splitSections(body: string): SplitResult {
  const lines = body.split("\n");
  const marks: { idx: number; datum: string }[] = [];
  let inCode = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
    if (inCode) return;
    const datum = parseMarker(l);
    if (datum) marks.push({ idx: i, datum });
  });
  if (!marks.length) return { preamble: body, sections: [] };
  const sections = marks.map((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].idx : lines.length;
    return {
      datum: m.datum,
      marker: lines[m.idx].trim(),
      line: m.idx + 1,
      body: trimBlock(lines.slice(m.idx + 1, end).join("\n")),
    };
  });
  return { preamble: trimBlock(lines.slice(0, marks[0].idx).join("\n")), sections };
}

/** Trennt Frontmatter-Block (inkl. ---) und Body. */
export function splitFrontmatter(content: string): { fm: string; body: string } {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { fm: "", body: content };
  return { fm: m[0], body: content.slice(m[0].length) };
}
