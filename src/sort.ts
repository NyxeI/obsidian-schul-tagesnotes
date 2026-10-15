import { type App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type { Fach } from "./config.ts";
import { computeTarget, findFach, hubFolderPath, linkTarget, safeName } from "./paths.ts";
import { deriveTags, sameList } from "./tags.ts";
import { DEFAULT_HUB_TEMPLATE, renderTemplate } from "./templates.ts";
import type { SchulSettings } from "./defaults.ts";

export type SortResult = "moved" | "updated" | "unchanged" | "skipped" | "conflict";

export async function ensureFolder(app: App, folder: string): Promise<void> {
  let current = "";
  for (const part of normalizePath(folder).split("/")) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(`„${current}“ ist eine Datei, kein Ordner.`);
    await app.vault.createFolder(current);
  }
}

export async function readTemplate(app: App, path: string, fallback: string): Promise<string> {
  const file = app.vault.getAbstractFileByPath(normalizePath(path));
  return file instanceof TFile ? app.vault.read(file) : fallback;
}

/** Sortiert Tagesnotes ein und hält Tags/Halbjahr synchron; legt fehlende Themen-Hubs an. */
export class Sorter {
  private timers = new Map<string, number>();
  private busy = new Set<string>();
  /** Während der Migration keine automatische Sortierung. */
  paused = false;

  private app: App;
  private settings: () => SchulSettings;

  constructor(app: App, settings: () => SchulSettings) {
    this.app = app;
    this.settings = settings;
  }

  schedule(file: TFile): void {
    if (this.paused) return;
    const old = this.timers.get(file.path);
    if (old !== undefined) window.clearTimeout(old);
    this.timers.set(
      file.path,
      window.setTimeout(() => {
        this.timers.delete(file.path);
        void this.sortFile(file).catch((e) => new Notice(`Schul-Tagesnotes: ${(e as Error).message}`));
      }, 800),
    );
  }

  cancelAll(): void {
    for (const t of this.timers.values()) window.clearTimeout(t);
    this.timers.clear();
  }

  async sortFile(file: TFile): Promise<SortResult> {
    if (file.extension !== "md" || this.busy.has(file.path)) return "skipped";
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.typ === "thema") return this.syncHub(file, fm);
    if (fm?.typ !== "tagesnote") return "skipped";

    const cfg = this.settings();
    const target = computeTarget(fm, cfg);
    if (!target) return "skipped";

    this.busy.add(file.path);
    try {
      let result: SortResult = "unchanged";

      const tags = deriveTags(fm.tags, target.fach, target.themen, cfg.faecher);
      const halbjahr = target.halbjahr ?? "";
      if (!sameList(fm.tags, tags) || String(fm.halbjahr ?? "") !== halbjahr) {
        await this.app.fileManager.processFrontMatter(file, (f) => {
          f.tags = tags;
          f.halbjahr = halbjahr;
        });
        result = "updated";
      }

      if (cfg.autoCreateHubs) {
        for (const thema of target.themen) await this.ensureHub(target.fach, thema, file.path);
      }

      if (file.path !== target.path) {
        if (this.app.vault.getAbstractFileByPath(target.path)) {
          new Notice(`Nicht verschoben: „${target.path}“ existiert schon.`);
          return "conflict";
        }
        const oldFolder = file.parent;
        await ensureFolder(this.app, target.folder);
        await this.app.fileManager.renameFile(file, target.path);
        if (oldFolder) await this.removeEmptyFolders(oldFolder, target.fach.folder);
        result = "moved";
      }
      return result;
    } finally {
      this.busy.delete(file.path);
    }
  }

  /** Entfernt leer gewordene Themen-/Halbjahr-Ordner unterhalb des Fachordners (nie den Fachordner selbst). */
  private async removeEmptyFolders(folder: TFolder, fachFolder: string): Promise<void> {
    const fachPath = normalizePath(`${this.settings().root}/${fachFolder}`);
    let current: TFolder | null = folder;
    while (current && current.path.startsWith(fachPath + "/") && current.children.length === 0) {
      const parent: TFolder | null = current.parent;
      await this.app.fileManager.trashFile(current);
      current = parent;
    }
  }

  /** Themen-Hubs: nur Tags synchron halten, nicht verschieben. */
  private async syncHub(file: TFile, fm: Record<string, unknown>): Promise<SortResult> {
    const cfg = this.settings();
    const fach = findFach(linkTarget(fm.fach), cfg.faecher);
    if (!fach) return "skipped";
    const tags = deriveTags(fm.tags, fach, [file.basename], cfg.faecher);
    if (sameList(fm.tags, tags)) return "unchanged";
    await this.app.fileManager.processFrontMatter(file, (f) => {
      f.tags = tags;
    });
    return "updated";
  }

  /** Legt den Themen-Hub an, falls kein Link-Ziel mit diesem Namen existiert. Gibt die Datei zurück. */
  async ensureHub(fach: Fach, thema: string, sourcePath = ""): Promise<TFile> {
    const existing = this.app.metadataCache.getFirstLinkpathDest(thema, sourcePath);
    if (existing) return existing;
    const cfg = this.settings();
    const folder = hubFolderPath(fach, cfg);
    const path = normalizePath(`${folder}/${safeName(thema)}.md`);
    const atPath = this.app.vault.getAbstractFileByPath(path);
    if (atPath instanceof TFile) return atPath;
    const template = await readTemplate(this.app, cfg.hubTemplate, DEFAULT_HUB_TEMPLATE);
    const baseName = cfg.themaBasePath.split("/").pop() ?? cfg.themaBasePath;
    const content = renderTemplate(template, { fach: fach.name, datum: "", halbjahr: "", themen: [thema], base: baseName });
    await ensureFolder(this.app, folder);
    const hub = await this.app.vault.create(path, content);
    await this.app.fileManager.processFrontMatter(hub, (f) => {
      f.tags = deriveTags(f.tags, fach, [thema], cfg.faecher);
    });
    return hub;
  }
}
