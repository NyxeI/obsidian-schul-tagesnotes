import { type App, TFile, TFolder, normalizePath } from "obsidian";
import type { PathConfig } from "../config.ts";
import { ensureFolder } from "../sort.ts";
import { rewriteCanvas, rewriteLinks } from "./links.ts";
import type { NoteIn } from "./plan.ts";
import { buildPlanV2, DEFAULT_V2_OPTIONS, type FileDates, type PlanV2, type PlanV2Options } from "./plan2.ts";

export interface MigrationV2Result {
  plan: PlanV2;
  log: string[];
  errors: string[];
  /** Links, die vorher aufgelöst waren und jetzt ins Leere zeigen ("Quelle → Link"). */
  newlyUnresolved: string[];
  removedFolders: string[];
  done: boolean;
}

/** Liest den Vault und baut den Plan v2 mit Obsidians Link-Auflösung und Dateidaten. */
export async function planV2FromVault(app: App, cfg: PathConfig, opts: PlanV2Options = DEFAULT_V2_OPTIONS): Promise<PlanV2> {
  const notes: NoteIn[] = [];
  const dates = new Map<string, FileDates>();
  for (const f of app.vault.getMarkdownFiles()) {
    notes.push({ path: f.path, content: await app.vault.cachedRead(f), fm: app.metadataCache.getFileCache(f)?.frontmatter });
    dates.set(f.path, { ctime: f.stat.ctime, mtime: f.stat.mtime });
  }
  const others = app.vault.getFiles().filter((f) => f.extension !== "md").map((f) => f.path);
  const resolve = (linkpath: string, source: string) => app.metadataCache.getFirstLinkpathDest(linkpath, source)?.path ?? null;
  return buildPlanV2(notes, others, dates, cfg, resolve, opts);
}

function unresolvedSet(app: App): Set<string> {
  const out = new Set<string>();
  const all = app.metadataCache.unresolvedLinks as Record<string, Record<string, number>>;
  for (const [src, links] of Object.entries(all)) for (const l of Object.keys(links)) out.add(`${src} → ${l}`);
  return out;
}

const fileAt = (app: App, path: string) => {
  const f = app.vault.getAbstractFileByPath(normalizePath(path));
  return f instanceof TFile ? f : null;
};

const appendText = (text: string, block: string) => text.replace(/\s*$/, "") + "\n\n" + block + "\n";

/**
 * Führt Migration v2 aus: Links umleiten (solange die alten Notes noch existieren), neue Notes anlegen,
 * alte Notes in den Papierkorb, Hubs anpassen, Dateien verschieben, leere Ordner entfernen.
 */
export async function applyMigrationV2(
  app: App,
  cfg: PathConfig,
  progress?: (msg: string) => void,
  opts: PlanV2Options = DEFAULT_V2_OPTIONS,
): Promise<MigrationV2Result> {
  const plan = await planV2FromVault(app, cfg, opts);
  const result: MigrationV2Result = { plan, log: [], errors: [], newlyUnresolved: [], removedFolders: [], done: false };
  const log = (m: string) => {
    result.log.push(m);
    progress?.(m);
  };
  const attempt = async (what: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      result.errors.push(`${what}: ${(e as Error).message}`);
    }
  };
  const before = unresolvedSet(app);
  const fachBase = cfg.kategorieBasePath.split("/").pop()!;

  // 1. Links im übrigen Vault umleiten (Auflösung gegen die noch vorhandenen alten Notes)
  const resolveFrom = (source: string) => (linkpath: string) => app.metadataCache.getFirstLinkpathDest(linkpath, source)?.path ?? null;
  for (const path of plan.linkEdits.keys()) {
    await attempt(`Links in ${path}`, async () => {
      const f = fileAt(app, path);
      if (!f) throw new Error("Note fehlt");
      await app.vault.process(f, (c) => rewriteLinks(c, resolveFrom(path), plan.targets, { oldPath: path }).content);
    });
  }
  log(`Links umgeleitet in ${plan.linkEdits.size} Notes`);
  let canvases = 0;
  for (const f of app.vault.getFiles().filter((x) => x.extension === "canvas")) {
    await attempt(`Canvas ${f.path}`, async () => {
      const r = rewriteCanvas(await app.vault.read(f), plan.targets);
      if (r.changed) {
        await app.vault.modify(f, r.content);
        canvases++;
      }
    });
  }
  log(`Canvas angepasst: ${canvases}`);

  // 2. Ink-Pfade in nicht aufgeteilten Notes
  for (const r of plan.rewrites) {
    await attempt(`Ink-Pfad in ${r.note}`, async () => {
      const f = fileAt(app, r.note);
      if (!f) throw new Error("Note fehlt");
      await app.vault.process(f, (c) => c.split(r.search).join(r.replace));
    });
  }

  // 3. Neue Notes anlegen
  let n = 0;
  for (const p of plan.parts) {
    await attempt(`Note ${p.path}`, async () => {
      await ensureFolder(app, p.path.split("/").slice(0, -1).join("/"));
      await app.vault.create(p.path, p.content);
    });
    if (++n % 100 === 0) log(`Neue Notes: ${n}/${plan.parts.length}`);
  }
  log(`Neue Notes: ${plan.parts.length}`);

  // 4. Alte Notes in den Papierkorb (nur wenn alle ihre Teile angelegt sind)
  for (const s of plan.sources) {
    await attempt(`Alte Note ${s.from}`, async () => {
      const parts = plan.targets.get(s.from)?.parts ?? [];
      if (!parts.length || parts.some((p) => !fileAt(app, p.path))) throw new Error("Teile fehlen – alte Note bleibt");
      const f = fileAt(app, s.from);
      if (f) await app.fileManager.trashFile(f);
    });
  }
  log(`Alte Notes entfernt: ${plan.sources.length}`);

  // 5. Kategorie-Hubs
  for (const h of plan.fachHubs) {
    await attempt(`Hub ${h.path}`, async () => {
      if (h.create !== undefined) {
        await ensureFolder(app, h.path.split("/").slice(0, -1).join("/"));
        if (!fileAt(app, h.path)) await app.vault.create(h.path, h.create);
        return;
      }
      if (h.renameFrom) {
        const old = fileAt(app, h.renameFrom);
        if (!old) throw new Error("umzubenennender Hub fehlt");
        await app.fileManager.renameFile(old, h.path);
      }
      const f = fileAt(app, h.path);
      if (!f) throw new Error("Hub fehlt");
      await app.fileManager.processFrontMatter(f, (fm) => {
        fm.typ = cfg.property;
        fm.tags = h.tags;
      });
      if (h.addEmbed) await app.vault.process(f, (c) => appendText(c, `## Übersicht\n![[${fachBase}]]`));
    });
  }
  log(`Hubs: ${plan.fachHubs.length}`);

  // 6. Andere Dateien verschieben (Obsidian passt Links an)
  for (const m of plan.files) {
    await attempt(`Datei ${m.from}`, async () => {
      const f = fileAt(app, m.from);
      if (!f) throw new Error("Datei fehlt");
      await ensureFolder(app, m.to.split("/").slice(0, -1).join("/"));
      await app.fileManager.renameFile(f, m.to);
    });
  }
  log(`Dateien: ${plan.files.length}`);

  // 7. Leere Ordner entfernen (nie den Kategorie-Ordner selbst)
  for (const fach of cfg.kategorien) {
    const folder = app.vault.getAbstractFileByPath(normalizePath(`${cfg.root}/${fach.folder}`));
    if (folder instanceof TFolder) await removeEmpty(app, folder, true, result);
  }
  log(`Leere Ordner entfernt: ${result.removedFolders.length}`);

  // 8. Links prüfen, sobald der Metadaten-Cache fertig ist
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, 20000);
    const ref = app.metadataCache.on("resolved", () => {
      window.clearTimeout(t);
      app.metadataCache.offref(ref);
      resolve();
    });
  });
  const after = unresolvedSet(app);
  result.newlyUnresolved = [...after].filter((x) => !before.has(x));
  log(`Neu unaufgelöste Links: ${result.newlyUnresolved.length}`);
  result.done = true;
  return result;
}

async function removeEmpty(app: App, folder: TFolder, isRoot: boolean, result: MigrationV2Result): Promise<void> {
  for (const child of [...folder.children]) {
    if (child instanceof TFolder) await removeEmpty(app, child, false, result);
  }
  if (!isRoot && folder.children.length === 0) {
    await app.fileManager.trashFile(folder);
    result.removedFolders.push(folder.path);
  }
}
