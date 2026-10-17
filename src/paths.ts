import type { Fach, Halbjahr, PathConfig } from "./config.ts";

/** Datum aus dem Frontmatter als YYYY-MM-DD (String oder Date), sonst null. */
export function normalizeDate(value: unknown): string | null {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  return null;
}

export function halbjahrFor(datum: string, halbjahre: Halbjahr[]): string | null {
  const hit = halbjahre.find((h) => h.start <= datum && datum <= h.end);
  return hit ? hit.name : null;
}

/** "[[Ordner/Geraden|Alias]]" → "Geraden"; "Geraden" → "Geraden". */
export function linkTarget(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let s = value.trim();
  const m = s.match(/^\[\[([^\]]*)\]\]$/);
  if (m) s = m[1];
  s = s.split("|")[0].split("#")[0].trim();
  if (!s) return null;
  const base = s.split("/").pop() ?? s;
  return base.replace(/\.md$/i, "").trim() || null;
}

/** Liste aus String oder Array, ohne leere Einträge. */
export function linkList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const out: string[] = [];
  for (const v of raw) {
    const t = linkTarget(v);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Entfernt Zeichen, die in Datei-/Ordnernamen nicht erlaubt sind. */
export function safeName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
}

export function fileBaseName(pattern: string, datum: string, fach: Fach): string {
  return safeName(pattern.replace(/\{datum\}/g, datum).replace(/\{fach\}/g, fach.name));
}

export function findFach(name: string | null, faecher: Fach[]): Fach | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return faecher.find((f) => f.name.toLowerCase() === lower || f.folder.toLowerCase() === lower) ?? null;
}

/** Fach anhand des Pfads unter dem Schulordner, z. B. "01-Schule/Mathe/…" → Mathe. */
export function fachFromPath(path: string, cfg: PathConfig): Fach | null {
  const prefix = cfg.root.replace(/\/$/, "") + "/";
  if (!path.startsWith(prefix)) return null;
  const folder = path.slice(prefix.length).split("/")[0];
  return cfg.kategorien.find((f) => f.folder === folder) ?? null;
}

/** Name des Zeitraum-Ordners: Halbjahr ("13-1") bzw. Jahr ("2026"); null = außerhalb aller Halbjahre. */
export function zeitraumFor(datum: string, cfg: PathConfig): string | null {
  return cfg.zeitraum === "jahr" ? datum.slice(0, 4) : halbjahrFor(datum, cfg.halbjahre);
}

export interface Target {
  fach: Fach;
  datum: string;
  /** Nur bei Zeitraum "halbjahr" gesetzt (Property `halbjahr`). */
  halbjahr: string | null;
  themen: string[];
  folder: string;
  path: string;
}

/** Zielort einer Tagesnote aus ihrem Frontmatter; null, wenn Fach oder Datum fehlen. */
export function computeTarget(fm: Record<string, unknown> | null | undefined, cfg: PathConfig): Target | null {
  if (!fm) return null;
  const fach = findFach(linkTarget(fm[cfg.property]), cfg.kategorien);
  const datum = normalizeDate(fm.datum);
  if (!fach || !datum) return null;
  const zeitraum = zeitraumFor(datum, cfg);
  const halbjahr = cfg.zeitraum === "halbjahr" ? zeitraum : null;
  const themen = themaOf(fm);
  const themaFolder = themen.length ? safeName(themen[0]) || cfg.generalFolder : cfg.generalFolder;
  const folder = [cfg.root, fach.folder, zeitraum ?? cfg.noHalbjahrFolder, themaFolder]
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  const path = `${folder}/${fileBaseName(cfg.fileNamePattern, datum, fach)}.md`;
  return { fach, datum, halbjahr, themen, folder, path };
}

export function hubFolderPath(fach: Fach, cfg: PathConfig): string {
  return [cfg.root, fach.folder, cfg.hubFolder].filter(Boolean).join("/");
}

/** Lokales Datum als YYYY-MM-DD. */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Sammelordner für Anhänge einer Kategorie und eines Zeitraums: <root>/<Kat>/attachments/<Zeitraum>. */
export function attachmentFolder(fach: Fach, zeitraum: string | null, cfg: PathConfig): string {
  return [cfg.root, fach.folder, "attachments", zeitraum ?? cfg.noHalbjahrFolder]
    .map((p) => p.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

/**
 * Zielpfad eines Anhangs, der neben einer Tagesnote in einem `attachments`-Ordner liegt
 * (Obsidian-Einstellung `./attachments` legt sonst einen Ordner pro Thema an).
 * null = bleibt liegen: liegt nicht unter dieser Kategorie, schon im Sammelordner, bei den Hubs oder ist eine Note.
 */
export function attachmentTarget(attPath: string, fach: Fach, zeitraum: string | null, cfg: PathConfig): string | null {
  if (attPath.endsWith(".md")) return null;
  const katPrefix = [cfg.root, fach.folder].map((p) => p.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/") + "/";
  if (!attPath.startsWith(katPrefix)) return null;
  const parts = attPath.slice(katPrefix.length).split("/");
  if (parts.length < 3 || parts[0] === "attachments" || parts[0] === cfg.hubFolder) return null;
  if (!parts.slice(1, -1).includes("attachments")) return null;
  return `${attachmentFolder(fach, zeitraum, cfg)}/${parts[parts.length - 1]}`;
}

/** "bild.png" → "bild 1.png", "bild 2.png", … bis `exists` false liefert. */
export function freePath(path: string, exists: (p: string) => boolean): string {
  if (!exists(path)) return path;
  const m = /^(.*?)(\.[^./]*)?$/.exec(path)!;
  for (let i = 1; ; i++) {
    const p = `${m[1]} ${i}${m[2] ?? ""}`;
    if (!exists(p)) return p;
  }
}

/** Thema einer Note: Property `thema` (Text oder Link), sonst die alte Link-Liste `themen`. */
export function themaOf(fm: Record<string, unknown> | null | undefined): string[] {
  if (!fm) return [];
  const t = fm.thema;
  if (typeof t === "string" && t.trim()) return [linkTarget(t) ?? t.trim()];
  if (Array.isArray(t) && t.length) return t.map((x) => linkTarget(x) ?? String(x)).filter(Boolean);
  return linkList(fm.themen);
}

/** "2026-10-17 Mathe" + n → "2026-10-17 Mathe" (n = 1) bzw. "2026-10-17 Mathe (2)". */
export function tagesnoteName(base: string, n: number): string {
  return n <= 1 ? base : `${base} (${n})`;
}

/** Nummer im Dateinamen einer Tagesnote: 1 ohne Suffix, n bei " (n)"; null, wenn der Name nicht zu `base` passt. */
export function suffixNumber(basename: string, base: string): number | null {
  if (basename === base) return 1;
  const m = /^(.*) \((\d+)\)$/.exec(basename);
  return m && m[1] === base ? Number(m[2]) : null;
}

/** Kleinste Nummer, deren Name noch frei ist. */
export function freeTagesnoteName(base: string, taken: (name: string) => boolean, start = 1): string {
  for (let n = start; ; n++) if (!taken(tagesnoteName(base, n))) return tagesnoteName(base, n);
}

/** Lokales Datum (YYYY-MM-DD) eines Zeitstempels in ms. */
export function localDate(ms: number): string {
  return today(new Date(ms));
}
