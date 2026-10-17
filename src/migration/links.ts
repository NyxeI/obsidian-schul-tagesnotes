// Links auf aufgeteilte Notes umleiten (pure): [[Alt#Überschrift]] → [[Teil n#Überschrift|Alt > Überschrift]].
import { headingKey } from "./headings.ts";

export interface PartRef {
  basename: string;
  path: string;
  /** Überschriften (headingKey) und Block-IDs (^id) in diesem Teil. */
  anchors: string[];
}

/** Alte Note → ihre neuen Teile (Teil 1 = Ziel für Links ohne Anker). */
export interface SplitTarget {
  title: string;
  parts: PartRef[];
}

/** Löst ein Link-Ziel (ohne #…) aus Sicht der Quelle zu einem Pfad VOR der Migration auf; null = nicht gefunden. */
export type Resolver = (linkpath: string) => string | null;

export interface RewriteResult {
  content: string;
  changed: number;
  /** Anker, die in keinem Teil gefunden wurden (Link zeigt dann auf Teil 1). */
  missing: string[];
}

/** Teil, der den Anker enthält; ohne Anker oder nicht gefunden → Teil 1. */
export function partFor(target: SplitTarget, subpath: string): { part: PartRef; found: boolean } {
  const segs = subpath.split("#").filter(Boolean);
  if (!segs.length) return { part: target.parts[0], found: true };
  const last = segs[segs.length - 1];
  const key = last.startsWith("^") ? last : headingKey(last);
  const part = target.parts.find((p) => p.anchors.includes(key));
  return part ? { part, found: true } : { part: target.parts[0], found: false };
}

function codeRanges(content: string): [number, number][] {
  const r: [number, number][] = [];
  for (const m of content.matchAll(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm)) r.push([m.index!, m.index! + m[0].length]);
  for (const m of content.matchAll(/`[^`\n]+`/g)) r.push([m.index!, m.index! + m[0].length]);
  return r;
}

// In Tabellen steht vor dem Alias-Trenner ein Backslash ("[[Ziel\\|Alias]]"); der bleibt erhalten.
const WIKI = /(!?)\[\[([^\]|#]*?)((?:#[^\]|]*?)?)(\\?)(?:\|([^\]]*))?\]\]/g;
const MDLINK = /(!?)\[([^\]]*)\]\((<[^>]+>|[^)\s]+)\)/g;

/**
 * Schreibt alle Wiki- und Markdown-Links um, deren Ziel eine aufgeteilte Note ist.
 * `self` = Pfad der Quelle VOR der Migration (für [[#Überschrift]]), `selfPart` = ihr neuer Basename, falls sie selbst ein Teil ist.
 */
export function rewriteLinks(
  content: string,
  resolve: Resolver,
  targets: Map<string, SplitTarget>,
  self?: { oldPath: string; basename?: string },
): RewriteResult {
  const ranges = codeRanges(content);
  const inCode = (i: number) => ranges.some(([s, e]) => i >= s && i < e);
  const missing: string[] = [];
  let changed = 0;

  let out = content.replace(WIKI, (m, bang: string, linkpath: string, sub: string, esc: string, alias: string | undefined, idx: number) => {
    if (inCode(idx)) return m;
    const lp = linkpath.trim();
    const oldPath = lp ? resolve(lp) : self?.oldPath ?? null;
    const target = oldPath ? targets.get(oldPath) : undefined;
    if (!target) return m;
    const { part, found } = partFor(target, sub);
    if (!found) missing.push(`${lp}${sub}`);
    // Verweis innerhalb desselben Teils bleibt [[#…]]
    if (!lp && self?.basename === part.basename) return m;
    const lastSeg = sub.split("#").filter(Boolean).pop();
    const shown = alias ?? (lp ? `${lp}${lastSeg ? ` > ${lastSeg}` : ""}` : lastSeg ?? "");
    changed++;
    const bar = `${esc}|`;
    return bang ? `![[${part.basename}${sub}${alias !== undefined ? `${bar}${alias}` : ""}]]` : `[[${part.basename}${sub}${bar}${shown}]]`;
  });

  out = out.replace(MDLINK, (m, bang: string, text: string, rawUrl: string, idx: number) => {
    if (inCode(idx) || /^[a-z]+:/i.test(rawUrl)) return m;
    const url = rawUrl.replace(/^<|>$/g, "");
    const hash = url.indexOf("#");
    let linkpath: string;
    let sub: string;
    try {
      linkpath = decodeURIComponent(hash >= 0 ? url.slice(0, hash) : url);
      sub = hash >= 0 ? decodeURIComponent(url.slice(hash)).replace(/^#+/, "#") : "";
    } catch {
      return m;
    }
    if (!/\.md$/i.test(linkpath) && linkpath !== "") return m;
    const oldPath = linkpath ? resolve(linkpath.replace(/\.md$/i, "")) : self?.oldPath ?? null;
    const target = oldPath ? targets.get(oldPath) : undefined;
    if (!target) return m;
    const { part, found } = partFor(target, sub);
    if (!found) missing.push(`${linkpath}${sub}`);
    changed++;
    return `${bang}[${text}](<${part.path}${sub}>)`;
  });

  return { content: out, changed, missing };
}

/** Canvas-Dateiknoten (Pfad VOR der Migration) auf den passenden Teil umbiegen. */
export function rewriteCanvas(json: string, targets: Map<string, SplitTarget>): { content: string; changed: number } {
  let data: { nodes?: { type?: string; file?: string; subpath?: string }[] };
  try {
    data = JSON.parse(json);
  } catch {
    return { content: json, changed: 0 };
  }
  let changed = 0;
  for (const n of data.nodes ?? []) {
    if (n.type !== "file" || !n.file) continue;
    const t = targets.get(n.file);
    if (!t) continue;
    n.file = partFor(t, n.subpath ?? "").part.path;
    changed++;
  }
  return { content: changed ? JSON.stringify(data, null, "\t") : json, changed };
}
