// Probelauf der Migration direkt auf einem Vault-Ordner – liest nur, schreibt nur den Bericht.
// Aufruf: node scripts/probelauf.ts <vault-pfad> <bericht.md> [plugin-data.json]
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { DEFAULT_SETTINGS, type SchulSettings } from "../src/defaults.ts";
import { buildPlan, type NoteIn } from "../src/migration/plan.ts";
import { renderReport } from "../src/migration/report.ts";

const [vault, reportPath, dataPath] = process.argv.slice(2);
if (!vault || !reportPath) {
  console.error("Aufruf: node scripts/probelauf.ts <vault> <bericht.md> [data.json]");
  process.exit(1);
}

const SKIP = new Set([".obsidian", ".git", ".trash"]);
const notes: NoteIn[] = [];
const others: string[] = [];
function walk(dir: string): void {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else {
      const rel = relative(vault, full).split("\\").join("/");
      if (rel.endsWith(".md")) {
        const content = readFileSync(full, "utf8");
        notes.push({ path: rel, content, fm: readFrontmatter(content) });
      } else others.push(rel);
    }
  }
}

/** Einfaches Frontmatter-Lesen (Skalare und Listen auf oberster Ebene) – reicht für typ/fach/datum/tags. */
function readFrontmatter(content: string): Record<string, unknown> | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm: Record<string, unknown> = {};
  let key = "";
  for (const line of m[1].split(/\r?\n/)) {
    const item = line.match(/^\s+-\s*(.*)$/);
    if (item && key) {
      const list = Array.isArray(fm[key]) ? (fm[key] as unknown[]) : [];
      list.push(item[1].replace(/^["']|["']$/g, ""));
      fm[key] = list;
      continue;
    }
    const kv = line.match(/^([^\s:][^:]*):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1].trim();
    const v = kv[2].trim();
    fm[key] = v === "" ? null : v.startsWith("[") && !v.startsWith("[[") ? v.slice(1, -1).split(",").map((x) => x.trim()).filter(Boolean) : v.replace(/^["']|["']$/g, "");
  }
  return fm;
}

walk(vault);
const cfg: SchulSettings = { ...DEFAULT_SETTINGS };
if (dataPath && existsSync(dataPath)) Object.assign(cfg, JSON.parse(readFileSync(dataPath, "utf8")));
const plan = buildPlan(notes, others, cfg);
writeFileSync(reportPath, renderReport(plan, `Migrationsbericht (Probelauf) – ${vault}`));
console.log(JSON.stringify({ notes: notes.length, files: others.length, themen: plan.themen.length, tagesnoten: plan.tagesnotes.length, dateien: plan.files.length, warnungen: plan.warnings.length }));
