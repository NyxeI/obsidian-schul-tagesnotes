import type { Fach, PathConfig } from "./config.ts";
import { findFach, linkTarget, normalizeDate, themaOf } from "./paths.ts";

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
  return collectThemenInfo(notes, fach, cfg).map((t) => t.name);
}

/** Thema mit Angaben für die Auswahl: letzte Tagesnote (YYYY-MM-DD, "" = keine) und Anzahl Tagesnotes. */
export interface ThemaInfo {
  name: string;
  zuletzt: string;
  anzahl: number;
}

/** Wie `collectThemen`, aber mit letzter Benutzung und Anzahl der Tagesnotes je Thema. */
export function collectThemenInfo(notes: NoteInfo[], fach: Fach, cfg: PathConfig): ThemaInfo[] {
  const anzahl = new Map<string, number>();
  const prefix = `${cfg.root.replace(/\/+$/, "")}/${fach.folder}/`;
  const lastUsed = new Map<string, string>();
  const mtime = new Map<string, number>();
  const note = (name: string, time: number) => {
    if (!lastUsed.has(name)) lastUsed.set(name, "");
    mtime.set(name, Math.max(mtime.get(name) ?? 0, time));
  };

  for (const n of notes) {
    const fm = n.fm ?? {};
    const sameFach = findFach(linkTarget(fm[cfg.property]), cfg.kategorien) === fach;
    if (fm.typ === "tagesnote") {
      if (!sameFach) continue;
      const datum = normalizeDate(fm.datum) ?? "";
      for (const t of themaOf(fm)) {
        anzahl.set(t, (anzahl.get(t) ?? 0) + 1);
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
    if (fm.typ === cfg.property || n.path === `${prefix}${fach.name}.md`) continue;
    if (fm["excalidraw-plugin"] !== undefined || fm["kanban-plugin"] !== undefined) continue;
    if (/(^|\/)attachments\//i.test(n.path.slice(prefix.length))) continue;
    note(n.basename, n.mtime);
  }

  return [...lastUsed.keys()]
    .sort((a, b) => {
      const byUse = (lastUsed.get(b) ?? "").localeCompare(lastUsed.get(a) ?? "");
      if (byUse) return byUse;
      const byTime = (mtime.get(b) ?? 0) - (mtime.get(a) ?? 0);
      return byTime || a.localeCompare(b, "de");
    })
    .map((name) => ({ name, zuletzt: lastUsed.get(name) ?? "", anzahl: anzahl.get(name) ?? 0 }));
}

/** Je Kategorie: letzte Tagesnote und Anzahl (für die Fachauswahl). Schlüssel = Kategorie-Name. */
export function kategorieStats(notes: NoteInfo[], cfg: PathConfig): Map<string, { zuletzt: string; anzahl: number }> {
  const out = new Map<string, { zuletzt: string; anzahl: number }>();
  for (const n of notes) {
    const fm = n.fm ?? {};
    if (fm.typ !== "tagesnote") continue;
    const fach = findFach(linkTarget(fm[cfg.property]), cfg.kategorien);
    if (!fach) continue;
    const datum = normalizeDate(fm.datum) ?? "";
    const cur = out.get(fach.name) ?? { zuletzt: "", anzahl: 0 };
    out.set(fach.name, { zuletzt: datum > cur.zuletzt ? datum : cur.zuletzt, anzahl: cur.anzahl + 1 });
  }
  return out;
}

/** Zuletzt benutzte Kategorien zuerst (nach Datum der letzten Tagesnote), unbenutzte danach in der bisherigen Reihenfolge. */
export function sortByRecent<T>(items: T[], zuletzt: (item: T) => string): T[] {
  return items
    .map((item, i) => ({ item, i, z: zuletzt(item) }))
    .sort((a, b) => b.z.localeCompare(a.z) || a.i - b.i)
    .map((x) => x.item);
}

/** "2026-10-15" → "15.10." (gleiches Jahr wie `heute`) bzw. "15.10.25". */
export function kurzDatum(datum: string, heute: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return "";
  const [y, m, d] = datum.split("-");
  return y === heute.slice(0, 4) ? `${d}.${m}.` : `${d}.${m}.${y.slice(2)}`;
}
