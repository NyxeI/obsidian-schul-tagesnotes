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
  const themen = linkList(fm.themen);
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
