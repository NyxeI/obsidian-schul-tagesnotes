// Checkboxen ↔ TaskNotes – reine Logik.
import { tagSlug, type Fach } from "./config.ts";
import { safeName } from "./paths.ts";

export interface TaskLine {
  /** Zeilenindex im Gesamttext. */
  index: number;
  line: string;
  checked: boolean;
  text: string;
  /** Eingerückte Folgezeilen (Unterpunkte). */
  children: string[];
  /** Name der verlinkten TaskNote, falls die Zeile schon eine verlinkt. */
  linked: string | null;
}

const CHECKBOX = /^- \[([ xX])\] (.*)$/;

/** Oberste Checkboxen (ohne Einrückung) außerhalb von Frontmatter und Codeblöcken. */
export function findTasks(content: string, isTask: (name: string) => boolean): TaskLine[] {
  // isTask erhält den Namen wie im Link; Groß-/Kleinschreibung entscheidet der Aufrufer.
  const lines = content.split("\n");
  const out: TaskLine[] = [];
  let i = 0;
  if (lines[0] === "---") {
    i = 1;
    while (i < lines.length && lines[i] !== "---") i++;
    i++;
  }
  let inCode = false;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*(```|~~~)/.test(l)) inCode = !inCode;
    if (inCode) continue;
    const m = l.match(CHECKBOX);
    if (!m) continue;
    const children: string[] = [];
    for (let j = i + 1; j < lines.length && /^(\t| {2,})\S/.test(lines[j]); j++) children.push(lines[j]);
    let linked: string | null = null;
    for (const lm of m[2].matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const name = lm[1].split("/").pop()!.trim();
      if (isTask(name)) {
        linked = name;
        break;
      }
    }
    out.push({ index: i, line: l, checked: m[1] !== " ", text: m[2], children, linked });
  }
  return out;
}

/**
 * Titel einer Aufgabe: ohne Links und Termine ("(@…)", "@{…}", "@2026-…").
 * Tags werden zu Wörtern (bekannte Kategorie-Tags zum Kategorienamen: "#wsem" → "W-Seminar"),
 * damit gleich lautende Aufgaben verschiedener Fächer nicht zusammenfallen.
 */
export function taskTitle(text: string, kategorien: Fach[] = []): string {
  const t = text
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/\(@[^)]*\)/g, " ")
    .replace(/@\{[^}]*\}/g, " ")
    .replace(/(^|\s)@\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2})?/g, " ")
    .replace(/(^|\s)#([^\s#]+)/g, (_m, pre: string, tag: string) => {
      const k = kategorien.find((x) => x.tag === tag.toLowerCase() || tagSlug(x.name) === tag.toLowerCase());
      return `${pre}${k ? k.name : tag.split("/").pop()}`;
    })
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s:;,.–-]+$/, "");
  const name = safeName(t).slice(0, 80).trim();
  return name || "Aufgabe";
}

/** Schul-Kategorie aus Tags im Text (#mathe, #wsem …). */
export function fachFromText(text: string, kategorien: Fach[]): Fach | null {
  for (const m of text.matchAll(/(?:^|\s)#([^\s#]+)/g)) {
    const tag = m[1].toLowerCase();
    const hit = kategorien.find((k) => k.tag === tag || tagSlug(k.name) === tag || tag.endsWith(`/${k.tag}`));
    if (hit) return hit;
  }
  return null;
}

export interface TaskNoteData {
  title: string;
  done: boolean;
  created: string;
  quelle: string;
  projects: string[];
  body: string;
  tag: string;
}

export function renderTaskNote(t: TaskNoteData): string {
  const day = t.created.slice(0, 10);
  return [
    "---",
    `title: ${JSON.stringify(t.title)}`,
    `status: ${t.done ? "done" : "open"}`,
    "priority: normal",
    `dateCreated: ${t.created}`,
    `dateModified: ${t.created}`,
    "tags:",
    `  - ${t.tag}`,
    ...(t.done ? [`completedDate: ${day}`] : []),
    ...(t.projects.length ? ["projects:", ...t.projects.map((p) => `  - "[[${p}]]"`)] : []),
    `quelle: "[[${t.quelle}]]"`,
    "---",
    t.body,
  ].join("\n");
}

/** Untereinträge für den Body der TaskNote: eine Einrückungsebene entfernen. */
export function dedentChildren(children: string[]): string {
  return children.map((c) => c.replace(/^(\t| {2,4})/, "")).join("\n");
}

export function linkLine(line: string, name: string): string {
  return `${line.replace(/\s+$/, "")} [[${name}]]`;
}

export function setChecked(line: string, checked: boolean): string {
  return line.replace(/^- \[[ xX]\]/, checked ? "- [x]" : "- [ ]");
}
