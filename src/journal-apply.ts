import { type App, TFile, TFolder, normalizePath } from "obsidian";
import { schule, type SchulSettings } from "./defaults.ts";
import {
  buildJournalPlan,
  cleanDailyBody,
  hubContent,
  journalFolder,
  journalPath,
  journalTags,
  parseJournalName,
  stripArchiveSection,
  type JournalPlan,
} from "./journal.ts";
import { linkTarget, normalizeDate, today } from "./paths.ts";
import { splitFrontmatter } from "./migration/dates.ts";
import { ensureFolder, type SortResult, type Sorter } from "./sort.ts";
import { syncTasks, resultLine } from "./tasks-apply.ts";
import { DEFAULT_JOURNAL_BASE } from "./templates.ts";

/** Quellordner der Journal-Migration. */
export const JOURNAL_SOURCES = ["03-Archiv/Unique_Notes", "03-Archiv/Daily_Notes", "03-Archiv/Tagespläne"];

const fileAt = (app: App, path: string) => {
  const f = app.vault.getAbstractFileByPath(normalizePath(path));
  return f instanceof TFile ? f : null;
};

export function nowParts(d = new Date()): { datum: string; uhrzeit: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  return { datum: today(d), uhrzeit: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

export class Journal {
  constructor(
    private app: App,
    private settings: () => SchulSettings,
    private sorter: Sorter,
  ) {}

  private get cfg() {
    return this.settings().journal;
  }

  private baseName(): string {
    return this.cfg.basePath.split("/").pop() ?? this.cfg.basePath;
  }

  async ensureBase(): Promise<void> {
    const p = normalizePath(this.cfg.basePath);
    if (this.app.vault.getAbstractFileByPath(p)) return;
    await ensureFolder(this.app, p.split("/").slice(0, -1).join("/"));
    await this.app.vault.create(p, DEFAULT_JOURNAL_BASE);
  }

  /** Sorter-Erweiterung: Journal-Notes in <root>/<Jahr>/<Jahr-Monat>/ halten, Tags pflegen. */
  async sort(file: TFile, fm: Record<string, unknown>): Promise<SortResult | null> {
    if (fm.typ !== "journal") return null;
    const datum = normalizeDate(fm.datum);
    const kategorie = linkTarget(Array.isArray(fm.kategorie) ? fm.kategorie[0] : fm.kategorie);
    if (!datum || !kategorie) return "skipped";
    let result: SortResult = "unchanged";
    const tags = journalTags(fm.tags, kategorie, this.cfg.tagPrefix);
    const current = Array.isArray(fm.tags) ? fm.tags.map(String) : [];
    if (tags.join("|") !== current.join("|")) {
      await this.app.fileManager.processFrontMatter(file, (f) => {
        f.tags = tags;
      });
      result = "updated";
    }
    // Datum im Dateinamen mitziehen, wenn es sich geändert hat
    let base = file.basename;
    const parsed = parseJournalName(base);
    if (parsed && parsed.datum !== datum && base.startsWith(parsed.datum)) base = datum + base.slice(parsed.datum.length);
    const target = `${journalFolder(this.cfg, datum)}/${base}.md`;
    if (target !== file.path) {
      if (this.app.vault.getAbstractFileByPath(target)) return "conflict";
      const old = file.parent;
      await ensureFolder(this.app, journalFolder(this.cfg, datum));
      await this.app.fileManager.renameFile(file, target);
      if (old) await this.sorter.removeEmptyFolders(old, this.cfg.root);
      result = "moved";
    }
    return result;
  }

  /** Neue Journal-Note der Kategorie mit Titel, jetzt. */
  async create(kategorie: string, titel: string): Promise<TFile> {
    await this.ensureBase();
    const { datum, uhrzeit } = nowParts();
    const t = titel.trim() || kategorie;
    let path = journalPath(this.cfg, datum, uhrzeit, t);
    for (let k = 2; this.app.vault.getAbstractFileByPath(path); k++) path = journalPath(this.cfg, datum, uhrzeit, `${t} ${k}`);
    await ensureFolder(this.app, journalFolder(this.cfg, datum));
    return this.app.vault.create(path, this.frontmatter(kategorie, datum, uhrzeit) + `# ${t}\n\n`);
  }

  private frontmatter(kategorie: string, datum: string, uhrzeit: string | null, extra: string[] = []): string {
    return [
      "---",
      "typ: journal",
      `kategorie: "[[${kategorie}]]"`,
      `datum: ${datum}`,
      ...(uhrzeit ? [`uhrzeit: "${uhrzeit}"`] : []),
      ...extra,
      "tags:",
      ...journalTags([], kategorie, this.cfg.tagPrefix).map((t) => `  - ${t}`),
      "---",
      "",
    ].join("\n");
  }

  /**
   * Notizblock archivieren: offene Aufgaben mit TaskNotes verlinken, dann eine datierte Kopie
   * ins Journal legen. Der Notizblock selbst bleibt (bis auf die Aufgaben-Links) unverändert.
   */
  async archiveNotizblock(): Promise<string> {
    const nb = fileAt(this.app, this.cfg.notizblockPath);
    if (!nb) throw new Error(`Notizblock „${this.cfg.notizblockPath}“ nicht gefunden.`);
    await this.ensureBase();
    const tasks = await syncTasks(this.app, this.settings(), nb);
    const { body } = splitFrontmatter(await this.app.vault.read(nb));
    const clean = stripArchiveSection(body, this.baseName()).trim();

    // Gleicher Inhalt wie die letzte Kopie → keine neue Kopie
    const last = this.latestArchive();
    if (last) {
      const lastBody = splitFrontmatter(await this.app.vault.read(last)).body.trim();
      if (lastBody === clean) return `Notizblock unverändert seit ${last.basename} – keine neue Kopie. (${resultLine(tasks)})`;
    }
    const { datum, uhrzeit } = nowParts();
    let path = journalPath(this.cfg, datum, uhrzeit, "Notizblock");
    for (let k = 2; this.app.vault.getAbstractFileByPath(path); k++) path = journalPath(this.cfg, datum, uhrzeit, `Notizblock ${k}`);
    await ensureFolder(this.app, journalFolder(this.cfg, datum));
    await this.app.vault.create(path, this.frontmatter("Notizblock", datum, uhrzeit) + clean + "\n");
    return `Notizblock archiviert: ${path.split("/").pop()} (${resultLine(tasks)})`;
  }

  private latestArchive(): TFile | null {
    let best: TFile | null = null;
    let bestKey = "";
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.typ !== "journal" || linkTarget(fm.kategorie) !== "Notizblock") continue;
      const key = `${normalizeDate(fm.datum)} ${fm.uhrzeit ?? ""} ${f.basename}`;
      if (key > bestKey) {
        bestKey = key;
        best = f;
      }
    }
    return best;
  }

  async planMigration(): Promise<JournalPlan> {
    const notes = [];
    for (const f of this.app.vault.getMarkdownFiles()) notes.push({ path: f.path, content: "" });
    return buildJournalPlan(notes, JOURNAL_SOURCES, this.cfg, schule(this.settings()).kategorien);
  }

  /** Unique Notes, Daily Notes und Tagespläne ins Journal überführen. */
  async migrate(progress?: (m: string) => void): Promise<{ plan: JournalPlan; errors: string[]; log: string[] }> {
    const plan = await this.planMigration();
    const errors: string[] = [];
    const log: string[] = [];
    const say = (m: string) => {
      log.push(m);
      progress?.(m);
    };
    const attempt = async (what: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (e) {
        errors.push(`${what}: ${(e as Error).message}`);
      }
    };
    await this.ensureBase();

    // 1. Neuester Notizblock: Kopie ins Archiv, dann wird er zur festen Notizblock-Note
    if (plan.notizblock) {
      const nb = plan.notizblock;
      const op = plan.ops.find((o) => o.from === nb.from)!;
      await attempt(`Notizblock ${nb.from}`, async () => {
        const f = fileAt(this.app, nb.from);
        if (!f) throw new Error("Note fehlt");
        const { body } = splitFrontmatter(await this.app.vault.read(f));
        await ensureFolder(this.app, journalFolder(this.cfg, op.datum));
        await this.app.vault.create(nb.archive, this.frontmatter("Notizblock", op.datum, op.uhrzeit, op.id ? [`id: "${op.id}"`] : []) + body.replace(/^\s+/, ""));
        await ensureFolder(this.app, this.cfg.notizblockPath.split("/").slice(0, -1).join("/"));
        await this.app.fileManager.renameFile(f, this.cfg.notizblockPath);
        const moved = fileAt(this.app, this.cfg.notizblockPath)!;
        await this.app.vault.modify(moved, hubContent("Notizblock", this.cfg, body));
      });
      say(`Notizblock: ${this.cfg.notizblockPath}`);
    }

    // 2. Alle anderen Notes verschieben und mit Properties versehen
    for (const op of plan.ops) {
      if (plan.notizblock && op.from === plan.notizblock.from) continue;
      await attempt(`Journal ${op.from}`, async () => {
        const f = fileAt(this.app, op.from);
        if (!f) throw new Error("Note fehlt");
        await ensureFolder(this.app, op.to.split("/").slice(0, -1).join("/"));
        await this.app.fileManager.renameFile(f, op.to);
        const moved = fileAt(this.app, op.to)!;
        await this.app.fileManager.processFrontMatter(moved, (fm) => {
          if (fm.Date === "Date") delete fm.Date;
          fm.typ = "journal";
          fm.kategorie = `[[${op.kategorie}]]`;
          fm.datum = op.datum;
          if (op.uhrzeit) fm.uhrzeit = op.uhrzeit;
          if (op.id) fm.id = op.id;
          if (op.fach) fm.fach = `[[${op.fach}]]`;
          fm.tags = journalTags(fm.tags, op.kategorie, this.cfg.tagPrefix);
        });
        if (op.daily) {
          await this.app.vault.process(moved, (c) => {
            const { fm, body } = splitFrontmatter(c);
            return fm + cleanDailyBody(body);
          });
        }
      });
    }
    say(`Journal-Notes: ${plan.ops.length}`);

    // 3. Kategorie-Hubs
    for (const h of plan.hubs) {
      await attempt(`Hub ${h.path}`, async () => {
        await ensureFolder(this.app, h.path.split("/").slice(0, -1).join("/"));
        await this.app.vault.create(h.path, h.content);
      });
    }
    say(`Hubs: ${plan.hubs.length}`);

    // 4. Leere Unterordner der Quellen entfernen (Quellordner selbst bleiben für die Core-Plugins)
    for (const src of JOURNAL_SOURCES) {
      const folder = this.app.vault.getAbstractFileByPath(src);
      if (folder instanceof TFolder) {
        for (const child of [...folder.children]) {
          if (child instanceof TFolder) await this.sorter.removeEmptyFolders(child, src);
        }
      }
    }
    return { plan, errors, log };
  }

  /** Aufgaben in Notizblock, ToDo-Notes und weiteren Quellen mit TaskNotes verlinken (älteste zuerst). */
  async linkAllTasks(extraSources: string[], dryRun: boolean): Promise<{ files: number; neu: number; verlinkt: number; abgeglichen: number }> {
    const s = this.settings();
    const files: { file: TFile; key: string; created?: Date }[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const kat = fm?.typ === "journal" ? linkTarget(fm.kategorie) : null;
      const inExtra = extraSources.some((src) => f.path === src || f.path.startsWith(src.replace(/\/+$/, "") + "/"));
      if (kat === "Notizblock" || kat === "ToDo") {
        const datum = normalizeDate(fm?.datum) ?? "0000-00-00";
        const [h, m] = String(fm?.uhrzeit ?? "00:00").split(":").map(Number);
        const [y, mo, d] = datum.split("-").map(Number);
        files.push({ file: f, key: `${datum} ${fm?.uhrzeit ?? ""}`, created: new Date(y, mo - 1, d, h || 0, m || 0) });
      } else if (inExtra || f.path === normalizePath(s.journal.notizblockPath)) {
        files.push({ file: f, key: f.path === s.journal.notizblockPath ? "9999" : `${new Date(f.stat.mtime).toISOString()}` });
      }
    }
    files.sort((a, b) => a.key.localeCompare(b.key));
    const total = { files: files.length, neu: 0, verlinkt: 0, abgeglichen: 0 };
    const planned = new Set<string>();
    for (const { file, created } of files) {
      const r = await syncTasks(this.app, s, file, { created, dryRun, planned });
      total.neu += r.neu;
      total.verlinkt += r.verlinkt;
      total.abgeglichen += r.abgeglichen;
    }
    return total;
  }
}

