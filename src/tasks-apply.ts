import { type App, TFile, normalizePath } from "obsidian";
import { schule, type SchulSettings } from "./defaults.ts";
import { ensureFolder } from "./sort.ts";
import { dedentChildren, fachFromText, findTasks, linkLine, renderTaskNote, setChecked, taskTitle } from "./tasks.ts";

export interface TaskSyncResult {
  /** neu angelegte TaskNotes */
  neu: number;
  /** Checkboxen, die mit einer vorhandenen TaskNote gleichen Titels verlinkt wurden */
  verlinkt: number;
  /** Status-Abgleiche (Checkbox ↔ TaskNote) */
  abgeglichen: number;
}

/** Lokale ISO-Zeit mit Zeitzone, wie TaskNotes sie schreibt (2026-10-15T09:09:00+02:00). */
export function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`
  );
}

/**
 * Offene Checkboxen einer Note mit TaskNotes verlinken (Zeile bleibt stehen, Link wird angehängt),
 * Status verlinkter Aufgaben in beide Richtungen abgleichen. dryRun: nur zählen.
 */
export async function syncTasks(
  app: App,
  settings: SchulSettings,
  file: TFile,
  opts: { created?: Date; dryRun?: boolean; /** im Probelauf schon „angelegte“ Titel (über mehrere Dateien) */ planned?: Set<string> } = {},
): Promise<TaskSyncResult> {
  const res: TaskSyncResult = { neu: 0, verlinkt: 0, abgeglichen: 0 };
  const folder = normalizePath(settings.tasks.folder);
  // Schlüssel klein geschrieben: Obsidian behandelt "Lernen.md" und "lernen.md" als dieselbe Datei.
  const taskFiles = new Map<string, TFile>();
  for (const f of app.vault.getMarkdownFiles()) if (f.path.startsWith(folder + "/")) taskFiles.set(f.basename.toLowerCase(), f);

  const content = await app.vault.read(file);
  const tasks = findTasks(content, (n) => taskFiles.has(n.toLowerCase()));
  const edits: { index: number; orig: string; neu: string }[] = [];
  const kategorien = schule(settings).kategorien;
  const created = isoLocal(opts.created ?? new Date());
  const quelle = `${file.path.replace(/\.md$/, "")}|${file.basename}`;

  for (const t of tasks) {
    if (t.linked) {
      const tf = taskFiles.get(t.linked.toLowerCase())!;
      const done = app.metadataCache.getFileCache(tf)?.frontmatter?.status === "done";
      if (t.checked && !done) {
        res.abgeglichen++;
        if (!opts.dryRun) {
          await app.fileManager.processFrontMatter(tf, (fm) => {
            fm.status = "done";
            fm.completedDate = isoLocal(new Date()).slice(0, 10);
            fm.dateModified = isoLocal(new Date());
          });
        }
      } else if (!t.checked && done) {
        res.abgeglichen++;
        edits.push({ index: t.index, orig: t.line, neu: setChecked(t.line, true) });
      }
      continue;
    }
    if (t.checked) continue; // erledigte Altlasten werden keine TaskNotes
    let name = taskTitle(t.text, kategorien);
    const known = taskFiles.get(name.toLowerCase());
    if (known) name = known.basename;
    if (known || opts.planned?.has(name.toLowerCase())) res.verlinkt++;
    else {
      res.neu++;
      if (!opts.dryRun) {
        await ensureFolder(app, folder);
        const fach = fachFromText(t.text, kategorien);
        const tf = await app.vault.create(
          `${folder}/${name}.md`,
          renderTaskNote({ title: name, done: false, created, quelle, projects: fach ? [fach.name] : [], body: dedentChildren(t.children), tag: settings.tasks.tag }),
        );
        taskFiles.set(name.toLowerCase(), tf);
      } else opts.planned?.add(name.toLowerCase());
    }
    edits.push({ index: t.index, orig: t.line, neu: linkLine(t.line, `${folder}/${name}|${name}`) });
  }

  if (edits.length && !opts.dryRun) {
    await app.vault.process(file, (c) => {
      const lines = c.split("\n");
      for (const e of edits) if (lines[e.index] === e.orig) lines[e.index] = e.neu;
      return lines.join("\n");
    });
  }
  return res;
}

export function addResults(a: TaskSyncResult, b: TaskSyncResult): TaskSyncResult {
  return { neu: a.neu + b.neu, verlinkt: a.verlinkt + b.verlinkt, abgeglichen: a.abgeglichen + b.abgeglichen };
}

export function resultLine(r: TaskSyncResult): string {
  return `${r.neu} Aufgaben neu, ${r.verlinkt} verlinkt, ${r.abgeglichen} abgeglichen`;
}
