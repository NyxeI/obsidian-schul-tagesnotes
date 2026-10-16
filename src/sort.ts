import { type App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import type { Fach, PathConfig } from "./config.ts";
import { attachmentTarget, computeTarget, findFach, freePath, hubFolderPath, linkTarget, safeName, zeitraumFor } from "./paths.ts";
import { deriveTags, sameList } from "./tags.ts";
import { DEFAULT_HUB_TEMPLATE, renderTemplate } from "./templates.ts";
import { bereichOf, type SchulSettings } from "./defaults.ts";
import { syncUnterthemen } from "./stichworte-apply.ts";

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
  /** Zusätzliche Sortierung für andere Note-Typen (z. B. Journal); gibt null zurück, wenn nicht zuständig. */
  extra: ((file: TFile, fm: Record<string, unknown>) => Promise<SortResult | null>) | null = null;

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
    if (!fm) return "skipped";
    if (this.extra) {
      const r = await this.extra(file, fm);
      if (r) return r;
    }
    const s = this.settings();
    const cfg = bereichOf(s, fm);
    if (!cfg) return "skipped";
    if (fm.typ === "thema") {
      const r = await this.syncHub(file, fm, cfg);
      return (await syncUnterthemen(this.app, file, fm)) && r === "unchanged" ? "updated" : r;
    }
    if (fm.typ !== "tagesnote") return "skipped";

    const target = computeTarget(fm, cfg);
    if (!target) return "skipped";

    this.busy.add(file.path);
    try {
      let result: SortResult = "unchanged";

      const tags = deriveTags(fm.tags, target.fach, target.themen, cfg.kategorien, cfg.tagPrefix);
      const halbjahr = target.halbjahr ?? "";
      const halbjahrStale = cfg.zeitraum === "halbjahr" && String(fm.halbjahr ?? "") !== halbjahr;
      if (!sameList(fm.tags, tags) || halbjahrStale) {
        await this.app.fileManager.processFrontMatter(file, (f) => {
          f.tags = tags;
          if (cfg.zeitraum === "halbjahr") f.halbjahr = halbjahr;
        });
        result = "updated";
      }

      if (await syncUnterthemen(this.app, file, fm)) result = "updated";

      if (s.autoCreateHubs) {
        for (const thema of target.themen) await this.ensureHub(cfg, target.fach, thema, file.path);
      }

      if (file.path !== target.path) {
        if (this.app.vault.getAbstractFileByPath(target.path)) {
          new Notice(`Nicht verschoben: „${target.path}“ existiert schon.`);
          return "conflict";
        }
        const oldFolder = file.parent;
        await ensureFolder(this.app, target.folder);
        await this.app.fileManager.renameFile(file, target.path);
        if (oldFolder) await this.removeEmptyFolders(oldFolder, `${cfg.root}/${target.fach.folder}`);
        result = "moved";
      }
      if (await this.collectAttachments(file, cfg, target.fach, zeitraumFor(target.datum, cfg))) {
        if (result === "unchanged") result = "updated";
      }
      return result;
    } finally {
      this.busy.delete(file.path);
    }
  }

  /** Anhänge aus `<Thema>/attachments/` in den Sammelordner `<Kat>/attachments/<Zeitraum>/` holen. */
  async collectAttachments(file: TFile, cfg: PathConfig, fach: Fach, zeitraum: string | null): Promise<boolean> {
    const links = this.app.metadataCache.resolvedLinks?.[file.path] ?? {};
    let moved = false;
    for (const linked of Object.keys(links)) {
      const att = this.app.vault.getAbstractFileByPath(linked);
      if (!(att instanceof TFile)) continue;
      const wanted = attachmentTarget(att.path, fach, zeitraum, cfg);
      if (!wanted) continue;
      const dest = freePath(wanted, (p) => this.app.vault.getAbstractFileByPath(p) !== null);
      const oldFolder = att.parent;
      await ensureFolder(this.app, dest.slice(0, dest.lastIndexOf("/")));
      await this.app.fileManager.renameFile(att, dest);
      if (oldFolder) await this.removeEmptyFolders(oldFolder, `${cfg.root}/${fach.folder}`);
      moved = true;
    }
    return moved;
  }

  /** Entfernt leer gewordene Ordner unterhalb von `stopAt` (nie `stopAt` selbst). */
  async removeEmptyFolders(folder: TFolder, stopAt: string): Promise<void> {
    const fachPath = normalizePath(stopAt);
    let current: TFolder | null = folder;
    while (current && current.path.startsWith(fachPath + "/") && current.children.length === 0) {
      const parent: TFolder | null = current.parent;
      await this.app.fileManager.trashFile(current);
      current = parent;
    }
  }

  /** Themen-Hubs: nur Tags synchron halten, nicht verschieben. */
  private async syncHub(file: TFile, fm: Record<string, unknown>, cfg: PathConfig): Promise<SortResult> {
    const fach = findFach(linkTarget(fm[cfg.property]), cfg.kategorien);
    if (!fach) return "skipped";
    const tags = deriveTags(fm.tags, fach, [file.basename], cfg.kategorien, cfg.tagPrefix);
    if (sameList(fm.tags, tags)) return "unchanged";
    await this.app.fileManager.processFrontMatter(file, (f) => {
      f.tags = tags;
    });
    return "updated";
  }

  /** Legt den Themen-Hub an, falls kein Link-Ziel mit diesem Namen existiert. Gibt die Datei zurück. */
  async ensureHub(cfg: PathConfig, fach: Fach, thema: string, sourcePath = ""): Promise<TFile> {
    const existing = this.app.metadataCache.getFirstLinkpathDest(thema, sourcePath);
    if (existing) return existing;
    const folder = hubFolderPath(fach, cfg);
    const path = normalizePath(`${folder}/${safeName(thema)}.md`);
    const atPath = this.app.vault.getAbstractFileByPath(path);
    if (atPath instanceof TFile) return atPath;
    const template = await readTemplate(this.app, cfg.hubTemplate, DEFAULT_HUB_TEMPLATE);
    const baseName = cfg.themaBasePath.split("/").pop() ?? cfg.themaBasePath;
    const content = renderTemplate(template, { fach: fach.name, datum: "", halbjahr: "", themen: [thema], base: baseName, property: cfg.property });
    await ensureFolder(this.app, folder);
    const hub = await this.app.vault.create(path, content);
    await this.app.fileManager.processFrontMatter(hub, (f) => {
      f.tags = deriveTags(f.tags, fach, [thema], cfg.kategorien, cfg.tagPrefix);
    });
    return hub;
  }
}
