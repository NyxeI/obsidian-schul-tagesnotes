// Begriffe und Personen in Notes finden und verlinken – reine Logik.
import { linkList } from "./paths.ts";

export interface Term {
  /** Note-Name (Link-Ziel). */
  name: string;
  path: string;
  typ: "begriff" | "person";
  /** Alle Schreibweisen, nach denen gesucht wird (Name + aliases + ggf. Nachname). */
  forms: string[];
}

export interface TermNoteIn {
  path: string;
  basename: string;
  content: string;
  fm: Record<string, unknown> | null | undefined;
}

const MIN_LEN = 4;

/** Nachname einer Person als zusätzliche Schreibweise ("Johan Gottfried Herder" → "Herder"). */
export function personForms(name: string, aliases: string[]): string[] {
  const forms = [name, ...aliases];
  const parts = name.split(/\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (last.length >= MIN_LEN && /^\p{Lu}/u.test(last)) forms.push(last);
  }
  return [...new Set(forms.filter((f) => f.trim().length >= MIN_LEN))];
}

export function buildTerms(notes: TermNoteIn[], begriffFolder: string, personFolder: string): Term[] {
  const terms: Term[] = [];
  for (const n of notes) {
    const typ = n.path.startsWith(begriffFolder + "/") ? "begriff" : n.path.startsWith(personFolder + "/") ? "person" : null;
    if (!typ) continue;
    const aliases = linkList(n.fm?.aliases ?? n.fm?.alias ?? []).map(String);
    const forms = typ === "person" ? personForms(n.basename, aliases) : [n.basename, ...aliases].filter((f) => f.length >= MIN_LEN);
    if (forms.length) terms.push({ name: n.basename, path: n.path, typ, forms: [...new Set(forms)] });
  }
  return terms;
}

/** Bereiche, in denen nicht verlinkt wird: Frontmatter, Code, Formeln, Überschriften, Links, URLs. */
export function protectedRanges(content: string): [number, number][] {
  const ranges: [number, number][] = [];
  const add = (re: RegExp) => {
    for (const m of content.matchAll(re)) ranges.push([m.index!, m.index! + m[0].length]);
  };
  add(/^---\n[\s\S]*?\n---\n/g); // Frontmatter
  add(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm); // Codeblöcke (inkl. Ink/Excalidraw)
  add(/\$\$[\s\S]*?\$\$/g); // Formelblöcke
  add(/(?<!\\)\$[^$\n]+?\$/g); // Inline-Formeln
  add(/`[^`\n]+`/g); // Inline-Code
  add(/^#{1,6} .*$/gm); // Überschriften
  add(/!?\[\[[^\]]*\]\]/g); // Wikilinks/Embeds
  add(/!?\[[^\]]*\]\([^)]*\)/g); // Markdown-Links
  add(/https?:\/\/\S+/g); // URLs
  add(/(^|\s)#[^\s#]+/g); // Tags
  return ranges;
}

const inRanges = (ranges: [number, number][], a: number, b: number) => ranges.some(([s, e]) => a < e && b > s);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Mention {
  term: Term;
  start: number;
  end: number;
  /** Text wie in der Note. */
  text: string;
  context: string;
}

/** Erstes unverlinktes Vorkommen je Begriff; überlappende Treffer: der längere gewinnt. */
export function findMentions(content: string, terms: Term[], selfName: string): Mention[] {
  const ranges = protectedRanges(content);
  const lower = content.toLowerCase();
  const candidates: Mention[] = [];
  for (const term of terms) {
    if (term.name === selfName) continue;
    // Note verlinkt den Begriff schon → nichts tun
    if (new RegExp(`\\[\\[(?:[^\\]|]*/)?${escapeRe(term.name)}(?:[#|][^\\]]*)?\\]\\]`, "i").test(content)) continue;
    let best: Mention | null = null;
    for (const form of term.forms) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(form)}(?![\\p{L}\\p{N}_])`, "giu");
      for (const m of content.matchAll(re)) {
        const start = m.index!;
        const end = start + m[0].length;
        if (inRanges(ranges, start, end)) continue;
        if (!best || start < best.start || (start === best.start && end > best.end)) {
          const ctxStart = Math.max(0, lower.lastIndexOf("\n", start) + 1, start - 50);
          const ctxEnd = Math.min(content.length, end + 50);
          const lineEnd = content.indexOf("\n", end);
          best = {
            term,
            start,
            end,
            text: m[0],
            context: content.slice(ctxStart, lineEnd === -1 ? ctxEnd : Math.min(ctxEnd, lineEnd)).replace(/\s+/g, " ").trim(),
          };
        }
        break; // erstes zulässiges Vorkommen dieser Schreibweise reicht
      }
    }
    if (best) candidates.push(best);
  }
  // Überlappungen auflösen: längere Treffer zuerst
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const chosen: Mention[] = [];
  for (const c of candidates) if (!chosen.some((x) => c.start < x.end && c.end > x.start)) chosen.push(c);
  return chosen.sort((a, b) => a.start - b.start);
}

/** Links einsetzen (von hinten nach vorn, damit Positionen stimmen). */
export function applyMentions(content: string, mentions: Mention[]): string {
  let out = content;
  for (const m of [...mentions].sort((a, b) => b.start - a.start)) {
    // In Tabellenzeilen trennt "|" Spalten – der Alias-Trenner muss dort "\|" lauten.
    const lineStart = content.lastIndexOf("\n", m.start - 1) + 1;
    const sep = /^\s*(?:>\s*)*\|/.test(content.slice(lineStart, m.start + 1)) ? "\\|" : "|";
    const link = m.text === m.term.name ? `[[${m.term.name}]]` : `[[${m.term.name}${sep}${m.text}]]`;
    out = out.slice(0, m.start) + link + out.slice(m.end);
  }
  return out;
}
