import { type App, TFile, normalizePath } from "obsidian";
import { applyMentions, buildTerms, findMentions, type Mention, type TermNoteIn } from "./begriffe.ts";
import { bereichOf, type SchulSettings } from "./defaults.ts";
import { linkList, linkTarget } from "./paths.ts";
import { tagList } from "./tags.ts";
import { addBegriffeToKategorieBase, addBegriffeToThemaBase } from "./templates.ts";

export const RESSOURCEN = {
  root: "02-Ressourcen",
  begriffe: "02-Ressourcen/02-1-Buzzwords",
  personen: "02-Ressourcen/02-2-Personen",
  templates: "02-Ressourcen/02-3Templates",
};

export interface BegriffePlan {
  /** Note-Pfad → Treffer */
  mentions: Map<string, Mention[]>;
  /** Begriff → Themen-Hubs, in denen er vorkommt */
  themen: Map<string, Set<string>>;
  /** Begriff → Kategorie-Hubs (Fach/Projekt) */
  kategorien: Map<string, Set<string>>;
  terms: number;
  links: number;
}

export async function planBegriffe(app: App, settings: SchulSettings, exclude: string[]): Promise<BegriffePlan> {
  const all: TermNoteIn[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(RESSOURCEN.begriffe + "/") && !f.path.startsWith(RESSOURCEN.personen + "/")) continue;
    all.push({ path: f.path, basename: f.basename, content: "", fm: app.metadataCache.getFileCache(f)?.frontmatter });
  }
  const ex = new Set(exclude.map((e) => e.toLowerCase()));
  const terms = buildTerms(all, RESSOURCEN.begriffe, RESSOURCEN.personen).filter((t) => !ex.has(t.name.toLowerCase()));
  const plan: BegriffePlan = { mentions: new Map(), themen: new Map(), kategorien: new Map(), terms: terms.length, links: 0 };
  const roots = settings.bereiche.map((b) => b.root.replace(/\/+$/, "") + "/");
  for (const f of app.vault.getMarkdownFiles()) {
    if (!roots.some((r) => f.path.startsWith(r))) continue;
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (fm?.typ !== "thema" && fm?.typ !== "tagesnote") continue;
    const found = findMentions(await app.vault.cachedRead(f), terms, f.basename);
    if (!found.length) continue;
    plan.mentions.set(f.path, found);
    plan.links += found.length;
    const cfg = bereichOf(settings, fm);
    const kat = cfg ? linkTarget(fm[cfg.property]) : null;
    const themen = fm.typ === "thema" ? [f.basename] : linkList(fm.themen);
    for (const m of found) {
      const t = plan.themen.get(m.term.name) ?? new Set<string>();
      themen.forEach((x) => t.add(x));
      plan.themen.set(m.term.name, t);
      if (kat) {
        const k = plan.kategorien.get(m.term.name) ?? new Set<string>();
        k.add(kat);
        plan.kategorien.set(m.term.name, k);
      }
    }
  }
  return plan;
}

/** Ressourcen-Properties setzen, Begriffe mit Themen/Kategorien verknüpfen, Links in den Notes einsetzen. */
export async function applyBegriffe(app: App, settings: SchulSettings, exclude: string[]): Promise<{ ressourcen: number; begriffe: number; links: number; errors: string[] }> {
  const errors: string[] = [];
  const plan = await planBegriffe(app, settings, exclude);

  // 1. Alle Ressourcen-Notes: typ + Tag (Templates ausgenommen)
  let ressourcen = 0;
  for (const f of app.vault.getMarkdownFiles()) {
    if (!f.path.startsWith(RESSOURCEN.root + "/") || f.path.startsWith(RESSOURCEN.templates + "/")) continue;
    const typ = f.path.startsWith(RESSOURCEN.begriffe + "/") ? "begriff" : f.path.startsWith(RESSOURCEN.personen + "/") ? "person" : "wissen";
    try {
      await app.fileManager.processFrontMatter(f, (fm) => {
        fm.typ = typ;
        const tags = tagList(fm.tags).filter((t) => !t.toLowerCase().startsWith("wissen/"));
        fm.tags = [`wissen/${typ}`, ...tags];
        const themen = plan.themen.get(f.basename);
        if (themen?.size) fm.themen = [...new Set([...linkList(fm.themen), ...themen])].sort().map((t) => `[[${t}]]`);
        const kats = plan.kategorien.get(f.basename);
        if (kats?.size) fm.kategorien = [...new Set([...linkList(fm.kategorien), ...kats])].sort().map((t) => `[[${t}]]`);
      });
      ressourcen++;
    } catch (e) {
      errors.push(`${f.path}: ${(e as Error).message}`);
    }
  }

  // 2. Links in Hubs und Tagesnotes – Treffer werden im aktuellen Text neu gesucht, damit Positionen stimmen
  let links = 0;
  for (const path of plan.mentions.keys()) {
    const f = app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) continue;
    const terms = plan.mentions.get(path)!.map((m) => m.term);
    try {
      await app.vault.process(f, (c) => {
        const now = findMentions(c, terms, f.basename);
        links += now.length;
        return applyMentions(c, now);
      });
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
    }
  }

  // 3. Ansicht „Begriffe“ in den Bases ergänzen
  const addView = async (basePath: string, fn: (t: string) => string) => {
    const f = app.vault.getAbstractFileByPath(normalizePath(basePath));
    if (f instanceof TFile) await app.vault.process(f, fn);
  };
  for (const b of settings.bereiche) {
    await addView(b.themaBasePath, addBegriffeToThemaBase);
    await addView(b.kategorieBasePath, addBegriffeToKategorieBase);
  }
  return { ressourcen, begriffe: plan.themen.size, links, errors };
}
