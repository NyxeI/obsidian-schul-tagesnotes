import { tagSlug, type Fach } from "./config.ts";

/** Tags aus dem Frontmatter als Liste ohne führendes "#" (String, Komma-Liste oder Array). */
export function tagList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\s]+/) : [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim().replace(/^#/, "");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Vom Plugin verwaltete Tags: "<präfix>/<kategorie>" und "<kategorie>/<thema>" (Präfix z. B. "schule").
 * Alle Tags unter dem Präfix und unter einem bekannten Kategorie-Slug gelten als verwaltet
 * und werden ersetzt; alle anderen Tags bleiben unverändert erhalten.
 */
export function deriveTags(existing: unknown, fach: Fach, themen: string[], allFaecher: Fach[], prefix = "schule"): string[] {
  const managedPrefixes = [`${prefix}/`, ...allFaecher.map((f) => `${f.tag}/`)];
  const kept = tagList(existing).filter((t) => {
    const lower = t.toLowerCase();
    return !managedPrefixes.some((p) => lower.startsWith(p));
  });
  const managed = [`${prefix}/${fach.tag}`];
  for (const thema of themen) {
    const slug = tagSlug(thema);
    if (slug) managed.push(`${fach.tag}/${slug}`);
  }
  const out: string[] = [];
  for (const t of [...managed, ...kept]) if (!out.includes(t)) out.push(t);
  return out;
}

export function sameList(a: unknown, b: string[]): boolean {
  const list = tagList(a);
  return list.length === b.length && list.every((v, i) => v === b[i]);
}
