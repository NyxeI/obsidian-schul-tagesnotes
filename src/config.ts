// Reine Datentypen und Hilfsfunktionen ohne Obsidian-Abhängigkeit (testbar mit node --test).

export interface Fach {
  /** Anzeigename, gleichzeitig Name des Fach-Hubs (z. B. "Mathe"). */
  name: string;
  /** Ordner unter dem Schulordner (meist gleich dem Namen). */
  folder: string;
  /** Tag-Slug, z. B. "mathe" → Tags "schule/mathe" und "mathe/<thema>". */
  tag: string;
}

export interface Halbjahr {
  name: string;
  /** Erster Tag, YYYY-MM-DD (inklusive). */
  start: string;
  /** Letzter Tag, YYYY-MM-DD (inklusive). */
  end: string;
}

/** Zeitraum-Ordner einer Tagesnote: Schulhalbjahr ("13-1") oder Kalenderjahr ("2026"). */
export type Zeitraum = "halbjahr" | "jahr";

/** Ein Bereich des Vaults mit Kategorien (Fächer, Projekte), Hubs, Themen und Tagesnotes. */
export interface BereichConfig {
  id: string;
  name: string;
  /** Wurzelordner, darunter ein Ordner pro Kategorie. */
  root: string;
  /** Property, die die Kategorie verlinkt ("fach", "projekt"); zugleich `typ` des Kategorie-Hubs. */
  property: string;
  /** Oberstes Tag-Präfix ("schule" → schule/mathe). */
  tagPrefix: string;
  zeitraum: Zeitraum;
  kategorien: Fach[];
  hubFolder: string;
  generalFolder: string;
  noHalbjahrFolder: string;
  fileNamePattern: string;
  tagesnoteTemplate: string;
  hubTemplate: string;
  /** Base für Kategorie-Hubs (Fach.base, Projekt.base). */
  kategorieBasePath: string;
  /** Base für Themen-Hubs ({{base}} im Hub-Template). */
  themaBasePath: string;
}

/** Bereich + gemeinsame Halbjahre: alles, was Pfad- und Tag-Berechnung brauchen. */
export interface PathConfig extends BereichConfig {
  halbjahre: Halbjahr[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Zeilen "Name | Ordner | tag" → Fächer. Ordner und Tag dürfen fehlen. */
export function parseFaecher(text: string): Fach[] {
  const result: Fach[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [name, folder, tag] = line.split("|").map((p) => p.trim());
    if (!name) continue;
    result.push({ name, folder: folder || name, tag: tag ? tagSlug(tag) : tagSlug(name) });
  }
  return result;
}

export function formatFaecher(faecher: Fach[]): string {
  return faecher.map((f) => `${f.name} | ${f.folder} | ${f.tag}`).join("\n");
}

/** Zeilen "Name | Start | Ende" → Halbjahre. Ungültige Zeilen werden übersprungen. */
export function parseHalbjahre(text: string): Halbjahr[] {
  const result: Halbjahr[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [name, start, end] = line.split("|").map((p) => p.trim());
    if (!name || !ISO_DATE.test(start ?? "") || !ISO_DATE.test(end ?? "")) continue;
    result.push({ name, start, end });
  }
  return result;
}

export function formatHalbjahre(halbjahre: Halbjahr[]): string {
  return halbjahre.map((h) => `${h.name} | ${h.start} | ${h.end}`).join("\n");
}

/** "Französisch" → "franzoesisch", "Politik und Gesellschaft" → "politik-und-gesellschaft". */
export function tagSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_/-]+/g, "-")
    .replace(/\/+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
