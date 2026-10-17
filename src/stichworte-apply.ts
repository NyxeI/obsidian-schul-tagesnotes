import { type App, TFile, normalizePath } from "obsidian";
import { tagSlug } from "./config.ts";
import type { SchulSettings } from "./defaults.ts";
import { themaOf } from "./paths.ts";
import { extractUnterthemen, normalizeTag, rewriteInlineTags, type TagZuordnung } from "./stichworte.ts";
import { tagList } from "./tags.ts";
import { addViews, UNTERTHEMEN_VIEWS_KATEGORIE, UNTERTHEMEN_VIEWS_THEMA } from "./templates.ts";

/** Kategorie-Namen und -Tags aller Bereiche: als Inline-Tag nur Dubletten der Ordnerstruktur. */
export function dubletten(s: SchulSettings): Set<string> {
  const out = new Set<string>();
  for (const b of s.bereiche) {
    for (const k of b.kategorien) {
      out.add(k.tag.toLowerCase());
      out.add(k.name.toLowerCase());
      out.add(tagSlug(k.name));
    }
  }
  return out;
}

/** Notes, deren Tags vereinheitlicht werden: Bereiche und Ressourcen – nicht Journal, Aufgaben-Quellen, TaskNotes, Templates. */
export function inScope(s: SchulSettings, path: string): boolean {
  const under = (root: string) => path === root || path.startsWith(root.replace(/\/+$/, "") + "/");
  if (under(s.tasks.folder) || under(s.journal.root) || s.tasks.quellen.some(under)) return false;
  if (under("02-Ressourcen/02-3Templates")) return false;
  return s.bereiche.some((b) => under(b.root)) || under("02-Ressourcen");
}

/** Frontmatter-Tags vereinheitlichen und um die Tags aus dem Text ergänzen. */
export function mergeFmTags(existing: unknown, fromText: string[], map: TagZuordnung, dub: Set<string>): string[] {
  const out: string[] = [];
  for (const t of tagList(existing)) {
    const n = normalizeTag(t, map, dub);
    if (n && !out.includes(n)) out.push(n);
  }
  for (const t of fromText) if (!out.includes(t)) out.push(t);
  return out;
}

export interface StichwortResult {
  notes: number;
  /** Notes mit geändertem Text */
  textNotes: number;
  /** umgeschriebene bzw. entfernte Inline-Tags */
  inlineTags: number;
  /** Notes mit Unterthemen */
  unterthemen: number;
  /** neue Tags und Anzahl Notes */
  tags: Map<string, number>;
  errors: string[];
}

export function sameStrings(a: unknown, b: string[]): boolean {
  const l = Array.isArray(a) ? a.map(String) : a == null ? [] : [String(a)];
  return l.length === b.length && l.every((v, i) => v === b[i]);
}

export async function runStichworte(app: App, s: SchulSettings, dryRun: boolean): Promise<StichwortResult> {
  const res: StichwortResult = { notes: 0, textNotes: 0, inlineTags: 0, unterthemen: 0, tags: new Map(), errors: [] };
  const dub = dubletten(s);
  const map = s.tagZuordnung;
  for (const f of app.vault.getMarkdownFiles()) {
    if (!inScope(s, f.path)) continue;
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    try {
      const content = await app.vault.cachedRead(f);
      const r = rewriteInlineTags(content, map, dub);
      const tags = mergeFmTags(fm?.tags, r.tags, map, dub);
      const isNote = fm?.typ === "thema" || fm?.typ === "tagesnote";
      const unter = isNote ? extractUnterthemen(content, [f.basename, ...themaOf(fm)]) : [];
      if (unter.length) res.unterthemen++;
      for (const t of tags) if (/^(stichwort|person|markierung)\//.test(t)) res.tags.set(t, (res.tags.get(t) ?? 0) + 1);
      const tagsChanged = !sameStrings(fm?.tags, tags) && (tags.length > 0 || fm?.tags !== undefined);
      const unterChanged = isNote && !sameStrings(fm?.unterthemen ?? [], unter);
      if (!r.changed && !tagsChanged && !unterChanged) continue;
      res.notes++;
      if (r.changed) {
        res.textNotes++;
        res.inlineTags += r.changed;
      }
      if (dryRun) continue;
      if (r.changed) await app.vault.process(f, (c) => rewriteInlineTags(c, map, dub).content);
      if (tagsChanged || unterChanged) {
        await app.fileManager.processFrontMatter(f, (m) => {
          if (tagsChanged) m.tags = tags;
          if (unterChanged) {
            if (unter.length) m.unterthemen = unter;
            else delete m.unterthemen;
          }
        });
      }
    } catch (e) {
      res.errors.push(`${f.path}: ${(e as Error).message}`);
    }
  }
  if (!dryRun) {
    for (const b of s.bereiche) {
      for (const [path, views] of [
        [b.themaBasePath, UNTERTHEMEN_VIEWS_THEMA],
        [b.kategorieBasePath, UNTERTHEMEN_VIEWS_KATEGORIE(b.property)],
      ] as const) {
        const f = app.vault.getAbstractFileByPath(normalizePath(path));
        if (f instanceof TFile) await app.vault.process(f, (c) => addViews(c, views));
      }
    }
  }
  return res;
}

/** Für den Sorter: Unterthemen einer Hub-/Tagesnote aktuell halten. */
export async function syncUnterthemen(app: App, file: TFile, fm: Record<string, unknown>): Promise<boolean> {
  if (fm.typ !== "thema" && fm.typ !== "tagesnote") return false;
  const unter = extractUnterthemen(await app.vault.cachedRead(file), [file.basename, ...themaOf(fm)]);
  if (sameStrings(fm.unterthemen ?? [], unter)) return false;
  await app.fileManager.processFrontMatter(file, (m) => {
    if (unter.length) m.unterthemen = unter;
    else delete m.unterthemen;
  });
  return true;
}
