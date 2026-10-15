import type { Fach, PathConfig } from "./config.ts";
import { findFach, linkList, linkTarget, normalizeDate } from "./paths.ts";

export interface NoteInfo {
  path: string;
  basename: string;
  mtime: number;
  fm: Record<string, unknown> | null | undefined;
}

/**
 * Themen eines Fachs für die Auswahl:
 * - Themen aus Tagesnotes (zuletzt benutzte zuerst),
 * - Themen-Hubs (`typ: thema`) mit passendem `fach`,
 * - alle übrigen Notes im Fachordner (alte Themen-Notes ohne Properties), zuletzt geänderte zuerst.
 * Ausgenommen: Tagesnotes, der Fach-Hub, Excalidraw-/Kanban-Dateien und Notes in attachments-Ordnern.
 */
export function collectThemen(notes: NoteInfo[], fach: Fach, cfg: PathConfig): string[] {
  const prefix = `${cfg.root.replace(/\/+$/, "")}/${fach.folder}/`;
  const lastUsed = new Map<string, string>();
  const mtime = new Map<string, number>();
  const note = (name: string, time: number) => {
    if (!lastUsed.has(name)) lastUsed.set(name, "");
    mtime.set(name, Math.max(mtime.get(name) ?? 0, time));
  };

  for (const n of notes) {
    const fm = n.fm ?? {};
    const sameFach = findFach(linkTarget(fm.fach), cfg.faecher) === fach;
    if (fm.typ === "tagesnote") {
      if (!sameFach) continue;
      const datum = normalizeDate(fm.datum) ?? "";
      for (const t of linkList(fm.themen)) {
        if ((lastUsed.get(t) ?? "") < datum) lastUsed.set(t, datum);
        else note(t, 0);
      }
      continue;
    }
    if (fm.typ === "thema" && sameFach) {
      note(n.basename, n.mtime);
      continue;
    }
    if (!n.path.startsWith(prefix)) continue;
    if (fm.typ === "fach" || n.path === `${prefix}${fach.name}.md`) continue;
    if (fm["excalidraw-plugin"] !== undefined || fm["kanban-plugin"] !== undefined) continue;
    if (/(^|\/)attachments\//i.test(n.path.slice(prefix.length))) continue;
    note(n.basename, n.mtime);
  }

  return [...lastUsed.keys()].sort((a, b) => {
    const byUse = (lastUsed.get(b) ?? "").localeCompare(lastUsed.get(a) ?? "");
    if (byUse) return byUse;
    const byTime = (mtime.get(b) ?? 0) - (mtime.get(a) ?? 0);
    return byTime || a.localeCompare(b, "de");
  });
}
