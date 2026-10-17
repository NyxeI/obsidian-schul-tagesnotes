// Migration v2 (pure): alte Themen-Notes → datierte Notes (pro Abschnitt), ein Hub pro Kategorie, keine Themen-Hubs.
import type { Fach, PathConfig } from "../config.ts";
import { computeTarget, fileBaseName, freeTagesnoteName, localDate, zeitraumFor } from "../paths.ts";
import { deriveTags, tagList } from "../tags.ts";
import { splitFrontmatter, splitSections } from "./dates.ts";
import { h3Headings, splitHeadings } from "./headings.ts";
import { rewriteLinks, type SplitTarget } from "./links.ts";
import { fixInkPaths, type FachHubOp, type MoveOp, type NoteIn, type Rewrite } from "./plan.ts";

export interface FileDates {
  ctime: number;
  mtime: number;
}

/** Eine neue datierte Note. */
export interface PartOp {
  path: string;
  basename: string;
  /** Pfad der alten Note. */
  from: string;
  fach: string;
  datum: string;
  geschaetzt: boolean;
  thema: string;
  abschnitt: string | null;
  teil: number;
  von: number;
  /** Vollständiger Inhalt (Frontmatter + Text, Links schon umgeleitet). */
  content: string;
  /** Länge des Textes (für den Bericht). */
  zeichen: number;
}

export interface SourceOp {
  from: string;
  fach: string;
  thema: string;
  kapitel: string | null;
  parts: number;
  datiert: number;
}

export interface PlanV2 {
  fachHubs: FachHubOp[];
  parts: PartOp[];
  sources: SourceOp[];
  /** alte Note → Teile (für Link-Umleitung im übrigen Vault) */
  targets: Map<string, SplitTarget>;
  files: MoveOp[];
  /** Ink-Pfade in Notes, die nicht aufgeteilt werden */
  rewrites: Rewrite[];
  /** Notes außerhalb der Aufteilung mit umzuleitenden Links: Pfad → Anzahl */
  linkEdits: Map<string, number>;
  /** Links mit Anker, deren Überschrift in keinem Teil gefunden wurde */
  missingAnchors: string[];
  skipped: { path: string; reason: string }[];
  untouched: string[];
  warnings: string[];
}

export interface PlanV2Options {
  /** Abschnitte kürzer als das werden mit dem vorigen zusammengelegt. */
  minLen: number;
  /** Bis zu dieser Überschriften-Ebene wird geteilt. */
  maxLevel: number;
}

export const DEFAULT_V2_OPTIONS: PlanV2Options = { minLen: 300, maxLevel: 2 };

/** Ordner einer früheren Jahrgangsstufe, z. B. "11", "11. Klasse" (bleiben bei Halbjahr-Bereichen außen vor). */
const ALTE_STUFE = /^(?:\d{1,2}|\d{1,2}\. ?Klasse|Klasse ?\d{1,2})$/i;

/** Frontmatter-Schlüssel, die das Plugin setzt – alte Werte dazu werden nicht übernommen. */
const OWN_KEYS = new Set(["typ", "datum", "halbjahr", "thema", "themen", "abschnitt", "teil", "kapitel", "quelle", "datum_geschaetzt", "unterthemen", "tags", "migriert", "aliases", "alias"]);

const baseName = (p: string) => p.split("/").pop() ?? p;
const stem = (p: string) => baseName(p).replace(/\.md$/i, "");
const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");

/** Datum einer Note ohne Marke: frühestes Dateidatum (Erstellt ist bei kopierten Dateien jünger als Geändert). */
export function estimatedDate(d: FileDates | undefined, fallback: string): string {
  if (!d) return fallback;
  const ms = Math.min(...[d.ctime, d.mtime].filter((x) => Number.isFinite(x) && x > 0));
  return Number.isFinite(ms) ? localDate(ms) : fallback;
}

/** YAML-Wert: JSON ist gültiges YAML; einfache Wörter bleiben unquotiert. */
function yamlValue(v: unknown): string {
  if (typeof v === "string" && /^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(v) && !/^\d{4}-\d{2}-\d{2}$/.test(v) && !/^(true|false|null|yes|no)$/i.test(v)) return v;
  return JSON.stringify(v);
}

function frontmatter(entries: [string, unknown][]): string {
  const lines = ["---"];
  for (const [k, v] of entries) {
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const x of v) lines.push(`  - ${yamlValue(x)}`);
    } else if (k === "datum" || typeof v === "boolean" || typeof v === "number") lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${yamlValue(v)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

interface Draft {
  from: string;
  fach: Fach;
  datum: string;
  geschaetzt: boolean;
  thema: string;
  kapitel: string | null;
  abschnitt: string | null;
  text: string;
  anchors: string[];
  oldFm: Record<string, unknown>;
  first: boolean;
}

/**
 * Plan für einen Bereich. `resolve(linkpath, source)` löst Links wie Obsidian auf (Pfad VOR der Migration oder null).
 * `fileDates` liefert Erstellt/Geändert der alten Notes für das geschätzte Datum.
 */
export function buildPlanV2(
  notes: NoteIn[],
  otherFiles: string[],
  fileDates: Map<string, FileDates>,
  cfg: PathConfig,
  resolve: (linkpath: string, source: string) => string | null,
  opts: PlanV2Options = DEFAULT_V2_OPTIONS,
  heute = localDate(Date.now()),
): PlanV2 {
  const plan: PlanV2 = {
    fachHubs: [], parts: [], sources: [], targets: new Map(), files: [], rewrites: [], linkEdits: new Map(),
    missingAnchors: [], skipped: [], untouched: [], warnings: [],
  };
  const root = cfg.root.replace(/\/+$/, "");
  const fachBase = baseName(cfg.kategorieBasePath);
  const fachPrefixes = cfg.kategorien.map((f) => `${root}/${f.folder}/`);
  for (const n of notes) {
    if (n.path.startsWith(`${root}/`) && !fachPrefixes.some((p) => n.path.startsWith(p))) plan.untouched.push(n.path);
  }
  // Vergebene Dateinamen (vault-weit eindeutig, damit Wikilinks eindeutig bleiben)
  const usedNames = new Set(notes.map((n) => stem(n.path)));
  const taken = new Set<string>([...notes.map((n) => n.path), ...otherFiles]);
  const drafts: Draft[] = [];
  const splitting = new Set<string>();
  /** Notes, die außen vor bleiben (frühere Jahrgangsstufe) – ihre Ordner und Anhänge bleiben liegen. */
  const excluded = new Set<string>();

  for (const fach of cfg.kategorien) {
    const prefix = `${root}/${fach.folder}/`;
    const hubPath = `${prefix}${fach.name}.md`;
    const hub = notes.find((n) => n.path === hubPath) ?? notes.find((n) => n.path === `${prefix}${fach.name} Hub.md`);
    if (hub) {
      plan.fachHubs.push({
        path: hubPath,
        fach: fach.name,
        tags: deriveTags(hub.fm?.tags, fach, [], cfg.kategorien, cfg.tagPrefix),
        addEmbed: !hub.content.includes(`[[${fachBase}`),
        ...(hub.path !== hubPath ? { renameFrom: hub.path } : {}),
      });
      if (hub.path !== hubPath) plan.warnings.push(`Hub \`${hub.path}\` wird zu \`${hubPath}\` umbenannt.`);
    } else {
      const tags = deriveTags([], fach, [], cfg.kategorien, cfg.tagPrefix);
      plan.fachHubs.push({
        path: hubPath, fach: fach.name, tags, addEmbed: false,
        create: ["---", `typ: ${cfg.property}`, "tags:", ...tags.map((t) => `  - ${t}`), "---", `# ${fach.name}`, "", "## Übersicht", `![[${fachBase}]]`, ""].join("\n"),
      });
      plan.warnings.push(`Kein Hub für ${fach.name} gefunden – \`${hubPath}\` wird neu angelegt.`);
    }
    const hubSource = hub?.path ?? hubPath;

    for (const n of notes.filter((x) => x.path.startsWith(prefix)).sort((a, b) => a.path.localeCompare(b.path))) {
      const rel = n.path.slice(prefix.length);
      if (n.path === hubPath || n.path === hubSource) continue;
      const fm = n.fm ?? {};
      if (fm.typ === "tagesnote") { plan.skipped.push({ path: n.path, reason: "bereits datierte Note" }); continue; }
      if (fm["excalidraw-plugin"] !== undefined) { plan.skipped.push({ path: n.path, reason: "Excalidraw-Zeichnung" }); continue; }
      if (fm["kanban-plugin"] !== undefined) { plan.skipped.push({ path: n.path, reason: "Kanban-Board" }); continue; }
      if (/(^|\/)attachments\//i.test(rel)) { plan.skipped.push({ path: n.path, reason: "liegt in attachments" }); continue; }
      const kapitel = typeof fm.kapitel === "string" ? fm.kapitel : dirOf(rel).replace(new RegExp(`^${cfg.hubFolder}(/|$)`), "") || null;
      const datumDatei = estimatedDate(fileDates.get(n.path), heute);
      const { body } = splitFrontmatter(n.content);
      // Base-Einbettung alter Themen-Hubs entfernen
      const clean = body.replace(/^## Tagesnotes\s*\n!\[\[[^\]]*Thema\.base[^\]]*\]\]\s*$/m, "").replace(/!\[\[Thema\.base[^\]]*\]\]/g, "");
      const split = splitSections(clean);
      // Nur die konfigurierten Halbjahre: Notes früherer Jahrgangsstufen bleiben unverändert liegen
      if (cfg.zeitraum === "halbjahr") {
        if (dirOf(rel).split("/").some((seg) => ALTE_STUFE.test(seg))) { plan.skipped.push({ path: n.path, reason: "Ordner einer früheren Jahrgangsstufe" }); excluded.add(n.path); continue; }
        if (!zeitraumFor(datumDatei, cfg) && !split.sections.some((s) => zeitraumFor(s.datum, cfg))) {
          plan.skipped.push({ path: n.path, reason: `vor den Halbjahren (Datum ${datumDatei})` });
          excluded.add(n.path);
          continue;
        }
      }
      splitting.add(n.path);
      // Thema-Hubs aus Migration v1 heißen schon richtig; sonst der Dateiname
      const thema = stem(n.path);
      const undated = splitHeadings(split.preamble, opts);
      // Liegt das Dateidatum vor den Halbjahren, bekommt der undatierte Teil die erste Datumsmarke innerhalb der Halbjahre
      const datumUndatiert = zeitraumFor(datumDatei, cfg) ? datumDatei : split.sections.find((x) => zeitraumFor(x.datum, cfg))?.datum ?? datumDatei;
      const dated = split.sections.map((s) => ({ heading: null as string | null, text: s.body, datum: s.datum }));
      // Kurzer Vorspann vor Datumsmarken (z. B. nur "# Titel") wird keine eigene Note, sondern kommt in den ersten Tag
      if (dated.length && undated.length === 1 && undated[0].text.length < opts.minLen) {
        dated[0].text = `${undated[0].text}\n\n${dated[0].text}`;
        undated.length = 0;
      }
      const all: { heading: string | null; text: string; anchors: string[]; datum: string; geschaetzt: boolean }[] = [
        ...undated.map((p) => ({ heading: p.heading, text: p.text, anchors: p.anchors, datum: datumUndatiert, geschaetzt: true })),
        ...dated.map((d) => ({ heading: d.heading, text: d.text, anchors: splitHeadings(d.text, { maxLevel: 6, minLen: 0 }).flatMap((p) => p.anchors), datum: d.datum, geschaetzt: false })),
      ];
      if (!all.length) all.push({ heading: null, text: "", anchors: [], datum: datumDatei, geschaetzt: true });
      for (const [i, p] of all.entries()) {
        if (!zeitraumFor(p.datum, cfg)) plan.warnings.push(`\`${n.path}\`: Datum ${p.datum} liegt in keinem Zeitraum → „${cfg.noHalbjahrFolder}“.`);
        drafts.push({ from: n.path, fach, datum: p.datum, geschaetzt: p.geschaetzt, thema, kapitel, abschnitt: p.heading, text: p.text, anchors: p.anchors, oldFm: fm, first: i === 0 });
      }
      if (all.length > 10) plan.warnings.push(`\`${n.path}\` wird in ${all.length} Notes geteilt.`);
      plan.sources.push({ from: n.path, fach: fach.name, thema, kapitel, parts: all.length, datiert: dated.length });
    }

    // Andere Dateien (PDFs, Bilder, Canvas, Ink) aus alten Ordnern → <Kategorie>/attachments/<alter Ordner>/
    for (const f of otherFiles.filter((x) => x.startsWith(prefix)).sort()) {
      const rel = f.slice(prefix.length);
      if (/^attachments\//i.test(rel)) continue;
      if (cfg.zeitraum === "halbjahr" && dirOf(rel).split("/").some((seg) => ALTE_STUFE.test(seg))) continue;
      if ([...excluded].some((e) => dirOf(e) === dirOf(f) && dirOf(f) !== dirOf(hubPath))) continue;
      const dir = dirOf(rel).split("/").filter((seg) => seg && seg.toLowerCase() !== "attachments" && seg !== cfg.hubFolder).join("/");
      const to = `${prefix}attachments/${dir ? dir + "/" : ""}${baseName(f)}`;
      if (to === f) continue;
      if (taken.has(to)) { plan.warnings.push(`Datei \`${f}\` bleibt liegen: \`${to}\` existiert schon.`); continue; }
      taken.delete(f);
      taken.add(to);
      plan.files.push({ from: f, to });
    }
  }

  // Ink-Pfade: in aufgeteilten Notes direkt im Text, sonst als Rewrite
  const ink = { files: plan.files, rewrites: [] as Rewrite[], warnings: plan.warnings };
  fixInkPaths(ink, notes, otherFiles);
  const inkFor = (path: string, text: string) =>
    ink.rewrites.filter((r) => r.note === path).reduce((t, r) => t.split(r.search).join(r.replace), text);
  plan.rewrites = ink.rewrites.filter((r) => !splitting.has(r.note));

  // Namen vergeben (Reihenfolge: Kategorie, alte Note, Teil)
  for (const n of splitting) usedNames.delete(stem(n));
  const byFrom = new Map<string, PartOp[]>();
  const draftOf = new Map<PartOp, Draft>();
  for (const d of drafts) {
    const target = computeTarget({ [cfg.property]: `[[${d.fach.name}]]`, datum: d.datum, thema: d.thema }, cfg)!;
    const base = fileBaseName(cfg.fileNamePattern, d.datum, d.fach);
    const name = freeTagesnoteName(base, (x) => usedNames.has(x));
    usedNames.add(name);
    const list = byFrom.get(d.from) ?? [];
    const p: PartOp = {
      path: `${target.folder}/${name}.md`, basename: name, from: d.from, fach: d.fach.name, datum: d.datum, geschaetzt: d.geschaetzt,
      thema: d.thema, abschnitt: d.abschnitt, teil: list.length + 1, von: 0, content: "", zeichen: d.text.length,
    };
    list.push(p);
    byFrom.set(d.from, list);
    draftOf.set(p, d);
  }
  for (const [from, list] of byFrom) {
    for (const p of list) p.von = list.length;
    plan.targets.set(from, { title: stem(from), parts: list.map((p) => ({ basename: p.basename, path: p.path, anchors: draftOf.get(p)!.anchors })) });
  }

  // Inhalte rendern, Links in den Teilen umleiten
  for (const [from, list] of byFrom) {
    for (const p of list) {
      const d = draftOf.get(p)!;
      const extra = d.first ? Object.entries(d.oldFm).filter(([k]) => !OWN_KEYS.has(k) && k !== cfg.property) : [];
      const aliases = d.first ? tagList(d.oldFm.aliases ?? d.oldFm.alias) : [];
      const fmText = frontmatter([
        ["typ", "tagesnote"],
        [cfg.property, `[[${d.fach.name}]]`],
        ["datum", d.datum],
        ...(cfg.zeitraum === "halbjahr" ? [["halbjahr", zeitraumFor(d.datum, cfg) ?? ""] as [string, unknown]] : []),
        ["thema", d.thema],
        ["abschnitt", d.abschnitt ?? undefined],
        ["teil", p.von > 1 ? `${p.teil}/${p.von}` : undefined],
        ["kapitel", d.kapitel ?? undefined],
        ["quelle", from],
        ["datum_geschaetzt", d.geschaetzt ? true : undefined],
        ["unterthemen", h3Headings(d.text)],
        ["aliases", aliases],
        ["tags", deriveTags(d.oldFm.tags, d.fach, [d.thema], cfg.kategorien, cfg.tagPrefix)],
        ["migriert", true],
        ...extra,
      ]);
      const text = inkFor(from, d.text);
      const r = rewriteLinks(text, (lp) => resolve(lp, from), plan.targets, { oldPath: from, basename: p.basename });
      plan.missingAnchors.push(...r.missing.map((m) => `${from}: ${m}`));
      p.content = `${fmText}\n${r.content}${r.content.endsWith("\n") ? "" : "\n"}`;
      plan.parts.push(p);
    }
  }

  // Übrige Notes: Links auf aufgeteilte Notes zählen (umgeschrieben wird beim Ausführen)
  for (const n of notes) {
    if (splitting.has(n.path)) continue;
    const r = rewriteLinks(n.content, (lp) => resolve(lp, n.path), plan.targets, { oldPath: n.path });
    if (r.changed) plan.linkEdits.set(n.path, r.changed);
    plan.missingAnchors.push(...r.missing.map((m) => `${n.path}: ${m}`));
  }
  return plan;
}

/** Resolver wie Obsidian ohne Metadaten-Cache (für den Probelauf): Pfad, Pfad ohne .md, sonst eindeutiger Basename (nächster zur Quelle). */
export function simpleResolver(paths: string[]): (linkpath: string, source: string) => string | null {
  const all = new Set(paths);
  const byName = new Map<string, string[]>();
  for (const p of paths) {
    for (const key of [stem(p).toLowerCase(), baseName(p).toLowerCase()]) byName.set(key, [...(byName.get(key) ?? []), p]);
  }
  return (linkpath, source) => {
    const lp = linkpath.trim();
    if (all.has(lp)) return lp;
    if (all.has(`${lp}.md`)) return `${lp}.md`;
    const cands = byName.get(baseName(lp).toLowerCase()) ?? [];
    if (cands.length <= 1) return cands[0] ?? null;
    // Mehrdeutig: wie Obsidian die Datei mit dem längsten gemeinsamen Ordnerpräfix zur Quelle
    const dir = dirOf(source);
    return [...cands].sort((a, b) => commonPrefix(dirOf(b), dir) - commonPrefix(dirOf(a), dir))[0];
  };
}

function commonPrefix(a: string, b: string): number {
  const x = a.split("/");
  const y = b.split("/");
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  return i;
}

