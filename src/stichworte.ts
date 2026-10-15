// Inline-Tags vereinheitlichen und Unterthemen aus Überschriften lesen – reine Logik.

/** Präfixe, die als bereits vereinheitlicht gelten. */
export const TAG_PREFIXE = ["stichwort/", "person/", "markierung/"];

/** Zuordnung alt (klein geschrieben, ohne #) → neu; "" = Tag entfällt (z. B. Fach-Dublette). */
export type TagZuordnung = Record<string, string>;

export const DEFAULT_TAG_ZUORDNUNG: TagZuordnung = {
  // Fach-/Bereichs-Dubletten (die Ordner/Properties ergeben schule/<fach> bzw. projekt/<name>)
  schule: "",
  info: "",
  english: "",
  entlisch: "",
  politikundgesellschaft: "",
  projekte: "",
  buzzword: "",
  // Markierungen
  abi_relevant: "markierung/abi-relevant",
  sideinfos: "markierung/sideinfo",
  wtf: "markierung/wtf",
  randomaberinteressant: "markierung/interessant",
  schulaufgabe: "markierung/schulaufgabe",
  "lektüre": "markierung/lektuere",
  // Personen
  nikolauskopernikus: "person/nikolaus-kopernikus",
  galileogalilei: "person/galileo-galilei",
  tychobrahe: "person/tycho-brahe",
  giordanobruno: "person/giordano-bruno",
  trevornoah: "person/trevor-noah",
  schiller: "person/friedrich-schiller",
  schopenhauer: "person/arthur-schopenhauer",
  drostehuelshoff: "person/droste-huelshoff",
  aldoushuxley: "person/aldous-huxley",
  // Synonyme und zusammengeschriebene Titel
  astro: "stichwort/astronomie",
  bornacrime: "stichwort/born-a-crime",
  bravenewworld: "stichwort/brave-new-world",
  heiroftheempire: "stichwort/heir-of-the-empire",
};

/** "NikolausKopernikus" → "nikolaus-kopernikus", "LoRa" → "lora", "parallele_ausfuehrung" → "parallele-ausfuehrung". */
export function stichwortSlug(tag: string): string {
  return tag
    .replace(/(?<=[a-zäöüß]{2})(?=[A-ZÄÖÜ][a-zäöüß])/g, "-")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Neuer Name eines Tags (ohne #): null = entfällt, sonst vereinheitlicht.
 * Hierarchische Tags (mit "/") bleiben unverändert – die verwaltet das Plugin bzw. der Nutzer bewusst.
 * `dubletten` = Kategorie-Tags/-Namen aller Bereiche (mathe, physik, wsem, bonsai, …).
 */
export function normalizeTag(tag: string, map: TagZuordnung, dubletten: Set<string>): string | null {
  const t = tag.replace(/^#/, "");
  if (t.includes("/")) return t;
  const lower = t.toLowerCase();
  if (lower in map) return map[lower] || null;
  if (dubletten.has(lower) || dubletten.has(stichwortSlug(t))) return null;
  const slug = stichwortSlug(t);
  return slug ? `stichwort/${slug}` : null;
}

/** Bereiche, in denen "#" kein Tag ist: Frontmatter, Code, Links, URLs. */
function protectedRanges(content: string): [number, number][] {
  const r: [number, number][] = [];
  const add = (re: RegExp) => {
    for (const m of content.matchAll(re)) r.push([m.index!, m.index! + m[0].length]);
  };
  add(/^---\n[\s\S]*?\n---\n/g);
  add(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm);
  add(/`[^`\n]+`/g);
  add(/!?\[\[[^\]]*\]\]/g);
  add(/!?\[[^\]]*\]\([^)]*\)/g);
  add(/https?:\/\/\S+/g);
  return r;
}

const INLINE_TAG = /(^|[ \t])#([\p{L}_][\p{L}\p{N}_/-]*)/gu;

export interface TagRewrite {
  content: string;
  /** neue Tags, die im Text stehen (für das Frontmatter) */
  tags: string[];
  /** Anzahl geänderter bzw. entfernter Tags */
  changed: number;
}

/** Inline-Tags im Text vereinheitlichen; entfallende Tags werden entfernt, reine Tag-Zeilen, die leer werden, ebenso. */
export function rewriteInlineTags(content: string, map: TagZuordnung, dubletten: Set<string>): TagRewrite {
  const ranges = protectedRanges(content);
  const inProt = (i: number) => ranges.some(([s, e]) => i >= s && i < e);
  const tags = new Set<string>();
  let changed = 0;
  const lines = content.split("\n");
  let offset = 0;
  const out: string[] = [];
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    if (/^#{1,6}\s/.test(line)) {
      out.push(line);
      continue;
    }
    let hadTag = false;
    const neu = line.replace(INLINE_TAG, (m, pre: string, tag: string, idx: number) => {
      if (inProt(lineStart + idx + pre.length)) return m;
      hadTag = true;
      const n = normalizeTag(tag, map, dubletten);
      if (n) tags.add(n);
      if (n === tag) return m;
      changed++;
      return n ? `${pre}#${n}` : pre;
    });
    // Zeile bestand nur aus Tags, die alle entfallen sind → Zeile weglassen
    if (hadTag && neu.trim() === "" && line.trim() !== "") continue;
    if (!hadTag) {
      out.push(neu);
      continue;
    }
    let tidy = neu.replace(/(\S)[ \t]{2,}/g, "$1 ").replace(/[ \t]+$/, "");
    if (!/^\s/.test(line)) tidy = tidy.trimStart(); // war nicht eingerückt → keine neue Einrückung
    out.push(tidy);
  }
  return { content: out.join("\n"), tags: [...tags], changed };
}

const UNTERTHEMA_STOP = new Set(
  "zusammenfassung|fazit|einleitung|schluss|hauptteil|gliederung|aufbau|vorgehen|vorbereitung|probleme|problem|merke|merksatz|definition|erinnerung|korrektur|inhalt|aufgabe|aufgaben|lösung|lösungen|notizen|übersicht|tagesnotes|archiv|hinweis|wichtig|tipp|beispiel|beispiele|vorteile|nachteile|ziel|ziele|frage|fragen|methode|material|quelle|quellen|text|übung|wiederholung|grundbegriffe|personen|begriffe|basissatz|deutungshypothese|tests|todo|navigation|stoff".split("|"),
);

/** Unterthemen = Überschriften ## und ### ohne Nummerierung, Formatierung und allgemeine Wörter. */
export function extractUnterthemen(content: string, ausserdem: string[] = []): string[] {
  const body = content.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "");
  const skip = new Set(ausserdem.map((x) => x.toLowerCase()));
  const out: string[] = [];
  for (const m of body.matchAll(/^#{2,3}\s+(.+?)\s*#*\s*$/gm)) {
    const h = m[1]
      .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`=]/g, "")
      .replace(/:[A-Za-z][\w-]*:/g, "")
      .replace(/^(?:[\dIVXivx]+(?:\.\d+)*[.)]?\s+)+/, "")
      .replace(/\s+/g, " ")
      .replace(/[\s:;,.–-]+$/, "")
      .trim();
    const lower = h.toLowerCase();
    if (h.length < 4 || h.length > 80 || UNTERTHEMA_STOP.has(lower) || skip.has(lower)) continue;
    if (/^(aufgabe|teil|seite|s\.|p\.)\s*\d/i.test(h) || !/\p{L}{3}/u.test(h)) continue;
    if (!out.some((x) => x.toLowerCase() === lower)) out.push(h);
  }
  return out;
}
