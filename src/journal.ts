// Journal: datierte Einzelnotes (Notizblock-Archiv, ToDo, Notiz, Tagesplan) – reine Logik.
import type { Fach } from "./config.ts";
import type { JournalConfig } from "./defaults.ts";
import { safeName } from "./paths.ts";
import { tagList } from "./tags.ts";
import { tagSlug } from "./config.ts";

export interface JournalName {
  datum: string;
  /** "HH:MM" oder null. */
  uhrzeit: string | null;
  titel: string;
  /** Zettel-ID (YYYYMMDDHHmm), falls der Name eine hatte. */
  id: string | null;
}

const p2 = (n: number | string) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Datum/Uhrzeit/Titel aus einem Dateinamen lesen:
 *   "202610050909 Notizblock", "202510091104-Studium", "202511061021",
 *   "23-04-2026" (Daily Note), "16.02.2025 Tagesplan", "2026-10-15 0909 Notizblock" (neues Format).
 */
export function parseJournalName(basename: string): JournalName | null {
  let m = basename.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*[-–]\s*|\s+|$)(.*)$/);
  if (m && validDate(+m[1], +m[2], +m[3]) && +m[4] < 24 && +m[5] < 60) {
    return { datum: `${m[1]}-${m[2]}-${m[3]}`, uhrzeit: `${m[4]}:${m[5]}`, titel: m[6].trim(), id: `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}` };
  }
  m = basename.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2})(\d{2}))?(?: (.*))?$/);
  if (m && validDate(+m[1], +m[2], +m[3])) {
    return { datum: `${m[1]}-${m[2]}-${m[3]}`, uhrzeit: m[4] ? `${m[4]}:${m[5]}` : null, titel: (m[6] ?? "").trim(), id: null };
  }
  m = basename.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})(?:\s+(.*))?$/);
  if (m && validDate(+m[3], +m[2], +m[1])) {
    return { datum: `${m[3]}-${p2(m[2])}-${p2(m[1])}`, uhrzeit: null, titel: (m[4] ?? "").trim(), id: null };
  }
  return null;
}

/** Kategorie aus Titel bzw. Herkunft. */
export function kategorieFor(titel: string, sourcePath: string, cfg: JournalConfig): string {
  const has = (k: string) => cfg.kategorien.includes(k);
  if (/notizblock/i.test(titel) && has("Notizblock")) return "Notizblock";
  if (/\bto[\s-]?do\b/i.test(titel) && has("ToDo")) return "ToDo";
  if ((/tagesplan/i.test(titel) || /(^|\/)(Daily_Notes|Tagespläne)\//.test(sourcePath)) && has("Tagesplan")) return "Tagesplan";
  return has("Notiz") ? "Notiz" : cfg.kategorien[0];
}

export function journalFolder(cfg: JournalConfig, datum: string): string {
  return `${cfg.root.replace(/\/+$/, "")}/${datum.slice(0, 4)}/${datum.slice(0, 7)}`;
}

/** "2026-10-05 0909 Notizblock" – Uhrzeit nur, wenn bekannt; leerer Titel → Kategorie. */
export function journalBaseName(datum: string, uhrzeit: string | null, titel: string): string {
  return safeName([datum, uhrzeit ? uhrzeit.replace(":", "") : "", titel].filter(Boolean).join(" "));
}

export function journalPath(cfg: JournalConfig, datum: string, uhrzeit: string | null, titel: string): string {
  return `${journalFolder(cfg, datum)}/${journalBaseName(datum, uhrzeit, titel)}.md`;
}

/** Tags einer Journal-Note: journal/<kategorie> ersetzt alte journal/-Tags, "#dailynote" entfällt, Rest bleibt. */
export function journalTags(existing: unknown, kategorie: string, prefix: string): string[] {
  const kept = tagList(existing).filter((t) => !t.toLowerCase().startsWith(`${prefix}/`) && t.toLowerCase() !== "dailynote");
  return [`${prefix}/${tagSlug(kategorie)}`, ...kept.filter((t) => t !== `${prefix}/${tagSlug(kategorie)}`)];
}

/** Body ohne Template-Reste der alten Daily Notes (leere "# "-Überschriften, verwaiste "---"). */
export function cleanDailyBody(body: string): string {
  const lines = body.split("\n").filter((l) => !/^#{1,6}\s*$/.test(l));
  while (lines.length && /^\s*(---)?\s*$/.test(lines[0])) lines.shift();
  return lines.join("\n");
}

/** Archiv-Embed aus dem Notizblock entfernen (für Kopien und den Vergleich). */
export function stripArchiveSection(body: string, baseName: string): string {
  const esc = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body
    .replace(new RegExp(`\\n*(?:## Archiv\\s*\\n)?!\\[\\[${esc}(?:#[^\\]]*)?\\]\\]\\s*$`), "")
    .replace(/\s+$/, "");
}

export interface JournalOp {
  from: string;
  to: string;
  datum: string;
  uhrzeit: string | null;
  id: string | null;
  kategorie: string;
  /** Schul-Kategorie aus dem Unterordner (z. B. Unique_Notes/Schule/Roboterbau). */
  fach: string | null;
  daily: boolean;
}

export interface JournalPlan {
  ops: JournalOp[];
  /** Neuester Notizblock: wird zur festen Notizblock-Note, vorher Kopie ins Archiv. */
  notizblock: { from: string; archive: string } | null;
  /** Hubs, die neu angelegt werden: Pfad → Inhalt. */
  hubs: { path: string; content: string }[];
  skipped: { path: string; reason: string }[];
  warnings: string[];
}

export interface JournalNoteIn {
  path: string;
  content: string;
}

export function hubContent(kategorie: string, cfg: JournalConfig, body = ""): string {
  const base = cfg.basePath.split("/").pop() ?? cfg.basePath;
  const tags = [`${cfg.tagPrefix}/${tagSlug(kategorie)}`];
  return [
    "---",
    "typ: journal-kategorie",
    "tags:",
    ...tags.map((t) => `  - ${t}`),
    "---",
    body ? body.replace(/\s+$/, "") : `# ${kategorie}`,
    "",
    "## Archiv",
    `![[${base}#Archiv]]`,
    "",
  ].join("\n");
}

/** Plan für Unique Notes, Daily Notes und Tagespläne → Journal. */
export function buildJournalPlan(notes: JournalNoteIn[], sources: string[], cfg: JournalConfig, schulKategorien: Fach[]): JournalPlan {
  const plan: JournalPlan = { ops: [], notizblock: null, hubs: [], skipped: [], warnings: [] };
  const taken = new Set(notes.map((n) => n.path));
  const inSource = (p: string) => sources.some((s) => p.startsWith(s.replace(/\/+$/, "") + "/"));

  for (const n of notes.filter((x) => inSource(x.path)).sort((a, b) => a.path.localeCompare(b.path))) {
    if (/(^|\/)attachments\//i.test(n.path)) continue;
    const base = n.path.split("/").pop()!.replace(/\.md$/i, "");
    const parsed = parseJournalName(base);
    if (!parsed) {
      plan.skipped.push({ path: n.path, reason: "kein Datum im Dateinamen" });
      continue;
    }
    const kategorie = kategorieFor(parsed.titel || base, n.path, cfg);
    const titel = parsed.titel || kategorie;
    const segs = n.path.split("/");
    const fachSeg = segs.slice(0, -1).find((s) => schulKategorien.some((k) => k.name === s || k.folder === s));
    let to = journalPath(cfg, parsed.datum, parsed.uhrzeit, titel);
    for (let k = 2; taken.has(to) && to !== n.path; k++) to = journalPath(cfg, parsed.datum, parsed.uhrzeit, `${titel} ${k}`);
    taken.delete(n.path);
    taken.add(to);
    plan.ops.push({
      from: n.path,
      to,
      datum: parsed.datum,
      uhrzeit: parsed.uhrzeit,
      id: parsed.id,
      kategorie,
      fach: fachSeg ?? null,
      daily: /(^|\/)Daily_Notes\//.test(n.path),
    });
  }

  const blocks = plan.ops.filter((o) => o.kategorie === "Notizblock");
  if (blocks.length && !notes.some((n) => n.path === cfg.notizblockPath)) {
    const latest = blocks.reduce((a, b) => (`${a.datum} ${a.uhrzeit}` >= `${b.datum} ${b.uhrzeit}` ? a : b));
    plan.notizblock = { from: latest.from, archive: latest.to };
  }
  for (const k of cfg.kategorien) {
    const path = `${cfg.root.replace(/\/+$/, "")}/${k}.md`;
    if (path === cfg.notizblockPath && (plan.notizblock || notes.some((n) => n.path === path))) continue;
    if (notes.some((n) => n.path === path)) continue;
    plan.hubs.push({ path, content: hubContent(k, cfg) });
  }
  return plan;
}
