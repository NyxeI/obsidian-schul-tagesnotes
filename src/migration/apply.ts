import { type App, TFile, TFolder, normalizePath } from "obsidian";
import type { PathConfig } from "../config.ts";
import { findFach } from "../paths.ts";
import { ensureFolder } from "../sort.ts";
import { splitFrontmatter } from "./dates.ts";
import { buildPlan, renderTagesnote, type MigrationPlan, type NoteIn } from "./plan.ts";

export interface MigrationResult {
  plan: MigrationPlan;
  log: string[];
  errors: string[];
  /** Links, die vorher aufgelöst waren und jetzt ins Leere zeigen ("Quelle → Link"). */
  newlyUnresolved: string[];
  removedFolders: string[];
  done: boolean;
}

/** Liest den Vault und baut den Plan (wie der Probelauf, aber mit Obsidians Metadaten). */
export async function planFromVault(app: App, cfg: PathConfig): Promise<MigrationPlan> {
  const notes: NoteIn[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    notes.push({ path: f.path, content: await app.vault.cachedRead(f), fm: app.metadataCache.getFileCache(f)?.frontmatter });
  }
  const others = app.vault.getFiles().filter((f) => f.extension !== "md").map((f) => f.path);
  return buildPlan(notes, others, cfg);
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

/** Führt die Migration aus. Fehler einzelner Schritte werden protokolliert, der Rest läuft weiter. */
export async function applyMigration(app: App, cfg: PathConfig, progress?: (msg: string) => void): Promise<MigrationResult> {
  const plan = await planFromVault(app, cfg);
  const result: MigrationResult = { plan, log: [], errors: [], newlyUnresolved: [], removedFolders: [], done: false };
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
  const themaBase = cfg.themaBasePath.split("/").pop()!;
  const fachBase = cfg.kategorieBasePath.split("/").pop()!;

  // 1. Ink-Pfade umschreiben (noch an den alten Pfaden)
  for (const r of plan.rewrites) {
    await attempt(`Ink-Pfad in ${r.note}`, async () => {
      const f = fileAt(app, r.note);
      if (!f) throw new Error("Note fehlt");
      await app.vault.process(f, (c) => c.split(r.search).join(r.replace));
    });
  }
  log(`Ink-Pfade: ${plan.rewrites.length}`);

  // 2. Tagesnotes anlegen bzw. ergänzen (bevor die Quellen gekürzt werden)
  for (const op of plan.tagesnotes) {
    await attempt(`Tagesnote ${op.path}`, async () => {
      const fach = findFach(op.fach, cfg.kategorien)!;
      if (op.existing) {
        const f = fileAt(app, op.path);
        if (!f) throw new Error("vorhandene Tagesnote fehlt");
        await app.vault.process(f, (c) => appendText(c, op.content));
      } else {
        await ensureFolder(app, op.path.split("/").slice(0, -1).join("/"));
        await app.vault.create(op.path, renderTagesnote(op, fach, cfg));
      }
    });
  }
  log(`Tagesnotes: ${plan.tagesnotes.length}`);

  // 3. Aufgeteilte Notes kürzen (Frontmatter bleibt unverändert)
  for (const t of plan.themen.filter((x) => x.newBody !== null)) {
    await attempt(`Kürzen ${t.from}`, async () => {
      const f = fileAt(app, t.from);
      if (!f) throw new Error("Note fehlt");
      await app.vault.process(f, (c) => {
        const { fm } = splitFrontmatter(c);
        return fm + (t.newBody ? t.newBody + "\n" : "");
      });
    });
  }
  log(`Aufgeteilte Notes gekürzt: ${plan.themen.filter((x) => x.newBody !== null).length}`);

  // 4. Notes → Themen-Hubs (verschieben, Properties, Base einbetten)
  let n = 0;
  for (const t of plan.themen) {
    await attempt(`Hub ${t.from}`, async () => {
      let f = fileAt(app, t.from);
      if (!f) throw new Error("Note fehlt");
      if (t.to !== t.from) {
        await ensureFolder(app, t.to.split("/").slice(0, -1).join("/"));
        await app.fileManager.renameFile(f, t.to);
        f = fileAt(app, t.to)!;
      }
      await app.fileManager.processFrontMatter(f, (fm) => {
        fm.typ = "thema";
        fm[cfg.property] = `[[${t.fach}]]`;
        if (t.kapitel) fm.kapitel = t.kapitel;
        fm.tags = t.tags;
      });
      if (t.addEmbed) await app.vault.process(f, (c) => appendText(c, `## Tagesnotes\n![[${themaBase}]]`));
    });
    if (++n % 50 === 0) log(`Themen-Hubs: ${n}/${plan.themen.length}`);
  }
  log(`Themen-Hubs: ${plan.themen.length}`);

  // 5. Fach-Hubs
  for (const h of plan.fachHubs) {
    await attempt(`Fach-Hub ${h.path}`, async () => {
      if (h.create !== undefined) {
        await ensureFolder(app, h.path.split("/").slice(0, -1).join("/"));
        await app.vault.create(h.path, h.create);
        return;
      }
      if (h.renameFrom) {
        const old = fileAt(app, h.renameFrom);
        if (!old) throw new Error("umzubenennender Hub fehlt");
        await app.fileManager.renameFile(old, h.path);
      }
      const f = fileAt(app, h.path);
      if (!f) throw new Error("Fach-Hub fehlt");
      await app.fileManager.processFrontMatter(f, (fm) => {
        fm.typ = cfg.property;
        fm.tags = h.tags;
      });
      if (h.addEmbed) await app.vault.process(f, (c) => appendText(c, `## Übersicht\n![[${fachBase}]]`));
    });
  }
  log(`Fach-Hubs: ${plan.fachHubs.length}`);

  // 6. Andere Dateien verschieben
  for (const m of plan.files) {
    await attempt(`Datei ${m.from}`, async () => {
      const f = fileAt(app, m.from);
      if (!f) throw new Error("Datei fehlt");
      await ensureFolder(app, m.to.split("/").slice(0, -1).join("/"));
      await app.fileManager.renameFile(f, m.to);
    });
  }
  log(`Dateien: ${plan.files.length}`);

  // 7. Leere alte Ordner entfernen (nie den Fachordner selbst)
  for (const fach of cfg.kategorien) {
    const folder = app.vault.getAbstractFileByPath(normalizePath(`${cfg.root}/${fach.folder}`));
    if (folder instanceof TFolder) await removeEmpty(app, folder, true, result);
  }
  log(`Leere Ordner entfernt: ${result.removedFolders.length}`);

  // 8. Links prüfen, sobald der Metadaten-Cache fertig ist
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, 15000);
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

async function removeEmpty(app: App, folder: TFolder, isRoot: boolean, result: MigrationResult): Promise<void> {
  for (const child of [...folder.children]) {
    if (child instanceof TFolder) await removeEmpty(app, child, false, result);
  }
  if (!isRoot && folder.children.length === 0) {
    await app.fileManager.trashFile(folder);
    result.removedFolders.push(folder.path);
  }
}
