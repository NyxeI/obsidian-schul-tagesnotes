// Migrationsplan: alte Fach/Kapitel/Thema-Struktur → Hubs + Tagesnotes (pure, ohne Obsidian).
import type { Fach } from "../config.ts";
import type { SchulSettings } from "../defaults.ts";
import { computeTarget, findFach, halbjahrFor, linkTarget, normalizeDate, safeName } from "../paths.ts";
import { deriveTags } from "../tags.ts";
import { splitFrontmatter, splitSections } from "./dates.ts";

export interface NoteIn {
  path: string;
  content: string;
  fm: Record<string, unknown> | null | undefined;
}

export interface FachHubOp {
  path: string;
  fach: string;
  tags: string[];
  addEmbed: boolean;
}

export interface ThemaOp {
  from: string;
  to: string;
  fach: string;
  kapitel: string | null;
  tags: string[];
  /** Neuer Body (ohne Frontmatter), wenn datierte Abschnitte abgetrennt wurden; sonst null. */
  newBody: string | null;
  addEmbed: boolean;
  /** Anzahl abgetrennter Tagesabschnitte. */
  split: number;
}

export interface Contribution {
  from: string;
  thema: string;
  marker: string;
  line: number;
  lines: number;
}

export interface TagesnoteOp {
  path: string;
  fach: string;
  datum: string;
  halbjahr: string | null;
  themen: string[];
  /** Vollständiger Inhalt für neue Notes bzw. anzuhängender Text für vorhandene. */
  content: string;
  existing: boolean;
  sources: Contribution[];
}

export interface MoveOp {
  from: string;
  to: string;
}

export interface Rewrite {
  /** Note, deren Text angepasst werden muss (Pfad VOR der Migration). */
  note: string;
  search: string;
  replace: string;
}

export interface MigrationPlan {
  fachHubs: FachHubOp[];
  themen: ThemaOp[];
  tagesnotes: TagesnoteOp[];
  files: MoveOp[];
  rewrites: Rewrite[];
  skipped: { path: string; reason: string }[];
  untouched: string[];
  warnings: string[];
}

const baseName = (p: string) => p.split("/").pop() ?? p;
const stem = (p: string) => baseName(p).replace(/\.md$/i, "");
const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");
const lineCount = (s: string) => (s ? s.split("\n").length : 0);

export function buildPlan(notes: NoteIn[], otherFiles: string[], cfg: SchulSettings): MigrationPlan {
  const plan: MigrationPlan = { fachHubs: [], themen: [], tagesnotes: [], files: [], rewrites: [], skipped: [], untouched: [], warnings: [] };
  const root = cfg.root.replace(/\/+$/, "");
  const themaBase = baseName(cfg.themaBasePath);
  const fachBase = baseName(cfg.fachBasePath);
  const halbjahrNames = new Set([...cfg.halbjahre.map((h) => h.name), cfg.noHalbjahrFolder]);

  // Belegte Pfade (nach der Migration) und Basename-Häufigkeit für eindeutige Links
  const taken = new Set<string>([...notes.map((n) => n.path), ...otherFiles]);
  const stemCount = new Map<string, number>();
  for (const n of notes) stemCount.set(stem(n.path), (stemCount.get(stem(n.path)) ?? 0) + 1);

  const tagesByKey = new Map<string, TagesnoteOp>();
  const existingTages = new Map<string, string>();
  for (const n of notes) {
    if (n.fm?.typ !== "tagesnote") continue;
    const fach = findFach(linkTarget(n.fm.fach), cfg.faecher);
    const datum = normalizeDate(n.fm.datum);
    if (fach && datum) existingTages.set(`${fach.name}|${datum}`, n.path);
  }

  const fachPrefixes = cfg.faecher.map((f) => `${root}/${f.folder}/`);
  for (const n of notes) {
    if (n.path.startsWith(`${root}/`) && !fachPrefixes.some((p) => n.path.startsWith(p))) plan.untouched.push(n.path);
  }

  for (const fach of cfg.faecher) {
    const prefix = `${root}/${fach.folder}/`;
    const hubPath = `${prefix}${fach.name}.md`;
    const hub = notes.find((n) => n.path === hubPath);
    if (hub) {
      plan.fachHubs.push({
        path: hubPath,
        fach: fach.name,
        tags: deriveTags(hub.fm?.tags, fach, [], cfg.faecher),
        addEmbed: !hub.content.includes(`[[${fachBase}`),
      });
    } else {
      plan.warnings.push(`Kein Fach-Hub \`${hubPath}\` gefunden – Fach.base kann für ${fach.name} nicht eingebettet werden.`);
    }

    const isNewStructure = (rel: string) => {
      const first = rel.split("/")[0];
      return first === cfg.hubFolder || halbjahrNames.has(first);
    };

    // --- Notes → Themen-Hubs (+ Tagesabschnitte) ---
    for (const n of notes.filter((x) => x.path.startsWith(prefix)).sort((a, b) => a.path.localeCompare(b.path))) {
      const rel = n.path.slice(prefix.length);
      if (n.path === hubPath) continue;
      const fm = n.fm ?? {};
      if (fm.typ === "tagesnote") { plan.skipped.push({ path: n.path, reason: "bereits Tagesnote" }); continue; }
      if (fm.typ === "thema" && rel.startsWith(`${cfg.hubFolder}/`)) { plan.skipped.push({ path: n.path, reason: "bereits Themen-Hub" }); continue; }
      if (fm["excalidraw-plugin"] !== undefined) { plan.skipped.push({ path: n.path, reason: "Excalidraw-Zeichnung" }); continue; }
      if (fm["kanban-plugin"] !== undefined) { plan.skipped.push({ path: n.path, reason: "Kanban-Board" }); continue; }
      if (/(^|\/)attachments\//i.test(rel)) { plan.skipped.push({ path: n.path, reason: "liegt in attachments" }); continue; }
      if (isNewStructure(rel)) { plan.skipped.push({ path: n.path, reason: "liegt schon in neuer Struktur" }); continue; }

      const dir = dirOf(rel);
      let name = stem(n.path);
      let to = `${prefix}${cfg.hubFolder}/${name}.md`;
      if (to !== n.path && taken.has(to)) {
        const suffix = dir ? baseName(dir) : "2";
        name = safeName(`${name} (${suffix})`);
        to = `${prefix}${cfg.hubFolder}/${name}.md`;
        let k = 2;
        while (taken.has(to)) to = `${prefix}${cfg.hubFolder}/${name} ${k++}.md`;
        name = stem(to);
        plan.warnings.push(`Namenskonflikt: \`${n.path}\` wird zu \`${to}\` umbenannt (Links werden von Obsidian angepasst).`);
      }
      taken.delete(n.path);
      taken.add(to);

      const { body } = splitFrontmatter(n.content);
      const split = splitSections(body);
      // Link auf den Hub: per Name, bei mehrdeutigem Namen per Pfad
      const unique = (stemCount.get(name) ?? 0) <= 1;
      const hubLinkTarget = unique ? name : `${to.replace(/\.md$/, "")}|${name}`;
      if (!unique) plan.warnings.push(`Name „${name}“ ist im Vault mehrdeutig – Tagesnotes verlinken den Hub per Pfad.`);

      for (const s of split.sections) {
        if (!halbjahrFor(s.datum, cfg.halbjahre)) {
          plan.warnings.push(`\`${n.path}\` Zeile ${s.line}: Datum ${s.datum} („${s.marker}“) liegt in keinem Halbjahr → Ordner „${cfg.noHalbjahrFolder}“. Tippfehler im Jahr?`);
        }
        addContribution(plan, tagesByKey, existingTages, taken, cfg, fach, s.datum, hubLinkTarget, name, s.body, {
          from: n.path, thema: name, marker: s.marker, line: s.line, lines: lineCount(s.body),
        });
      }

      plan.themen.push({
        from: n.path,
        to,
        fach: fach.name,
        kapitel: dir || null,
        tags: deriveTags(fm.tags, fach, [name], cfg.faecher),
        newBody: split.sections.length ? split.preamble : null,
        addEmbed: !n.content.includes(`[[${themaBase}`),
        split: split.sections.length,
      });
    }

    // --- Andere Dateien (PDFs, Bilder, Canvas, Ink) aus alten Kapitelordnern ---
    for (const f of otherFiles.filter((x) => x.startsWith(prefix)).sort()) {
      const rel = f.slice(prefix.length);
      if (isNewStructure(rel) || /^attachments\//i.test(rel)) continue;
      const dir = dirOf(rel)
        .split("/")
        .filter((seg) => seg && seg.toLowerCase() !== "attachments")
        .join("/");
      let to: string;
      if (/\.canvas$/i.test(f)) to = `${prefix}${cfg.hubFolder}/${baseName(f)}`;
      else to = `${prefix}attachments/${dir ? dir + "/" : ""}${baseName(f)}`;
      if (to === f) continue;
      if (taken.has(to)) {
        plan.warnings.push(`Datei \`${f}\` bleibt liegen: \`${to}\` existiert schon.`);
        continue;
      }
      taken.delete(f);
      taken.add(to);
      plan.files.push({ from: f, to });
    }
  }

  fixInkPaths(plan, notes, otherFiles);
  plan.tagesnotes = [...tagesByKey.values()].sort((a, b) => a.path.localeCompare(b.path));
  return plan;
}

function addContribution(
  plan: MigrationPlan,
  byKey: Map<string, TagesnoteOp>,
  existing: Map<string, string>,
  taken: Set<string>,
  cfg: SchulSettings,
  fach: Fach,
  datum: string,
  linkText: string,
  thema: string,
  body: string,
  source: Contribution,
): void {
  const key = `${fach.name}|${datum}`;
  const section = `## ${thema}\n\n${body}\n`;
  let op = byKey.get(key);
  if (!op) {
    const existingPath = existing.get(key);
    const target = computeTarget({ fach: `[[${fach.name}]]`, datum, themen: [`[[${linkText}]]`] }, cfg)!;
    const path = existingPath ?? target.path;
    if (!existingPath && taken.has(path)) {
      plan.warnings.push(`Tagesnote \`${path}\` existiert schon als andere Datei – Konflikt, bitte prüfen.`);
    }
    taken.add(path);
    op = { path, fach: fach.name, datum, halbjahr: target.halbjahr, themen: [], content: "", existing: !!existingPath, sources: [] };
    byKey.set(key, op);
  }
  if (!op.themen.includes(linkText)) op.themen.push(linkText);
  op.sources.push(source);
  op.content += (op.content ? "\n" : "") + section;
}

/**
 * Ink bettet Zeichnungen per absolutem Pfad im JSON ein ("filepath": "…"); Obsidian passt diese
 * Pfade beim Verschieben nicht an. Für jeden Verweis wird der Zielort nach der Migration bestimmt:
 * verschobene Datei → neuer Pfad; toter Pfad → eindeutige Datei mit gleichem Namen (falls vorhanden).
 */
function fixInkPaths(plan: MigrationPlan, notes: NoteIn[], otherFiles: string[]): void {
  const moved = new Map(plan.files.map((f) => [f.from, f.to]));
  const byName = new Map<string, string[]>();
  for (const f of otherFiles) {
    if (!/\.(drawing|writing)$/i.test(f)) continue;
    const list = byName.get(baseName(f)) ?? [];
    list.push(f);
    byName.set(baseName(f), list);
  }
  const existing = new Set(otherFiles);
  const seen = new Set<string>();
  for (const n of notes) {
    for (const m of n.content.matchAll(/"filepath":\s*"([^"]+\.(?:drawing|writing))"/gi)) {
      const ref = m[1];
      const key = `${n.path}|${ref}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let current: string | null = existing.has(ref) ? ref : null;
      if (!current) {
        const candidates = byName.get(baseName(ref)) ?? [];
        if (candidates.length === 1) current = candidates[0];
        else {
          plan.warnings.push(`Ink-Verweis in \`${n.path}\` zeigt ins Leere und ist nicht eindeutig reparierbar: \`${ref}\`.`);
          continue;
        }
      }
      const target = moved.get(current) ?? current;
      if (target !== ref) plan.rewrites.push({ note: n.path, search: `"${ref}"`, replace: `"${target}"` });
    }
  }
}

/** Vollständiger Inhalt einer neu anzulegenden Tagesnote. */
export function renderTagesnote(op: TagesnoteOp, fach: Fach, allFaecher: Fach[]): string {
  const names = op.themen.map((t) => linkTarget(`[[${t}]]`) ?? t);
  const tags = deriveTags([], fach, names, allFaecher);
  return [
    "---",
    "typ: tagesnote",
    `fach: "[[${fach.name}]]"`,
    `datum: ${op.datum}`,
    `halbjahr: ${op.halbjahr ?? ""}`,
    "themen:",
    ...op.themen.map((t) => `  - "[[${t}]]"`),
    "tags:",
    ...tags.map((t) => `  - ${t}`),
    "migriert: true",
    "---",
    `# ${fach.name}, ${op.datum}`,
    "",
    op.content,
  ].join("\n");
}
