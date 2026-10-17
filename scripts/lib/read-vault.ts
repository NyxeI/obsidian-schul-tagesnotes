// Vault-Ordner ohne Obsidian lesen (für Probeläufe): Notes mit einfachem Frontmatter, übrige Dateien, Dateidaten.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { NoteIn } from "../../src/migration/plan.ts";
import type { FileDates } from "../../src/migration/plan2.ts";

const SKIP = new Set([".obsidian", ".git", ".trash"]);

export interface VaultFiles {
  notes: NoteIn[];
  others: string[];
  dates: Map<string, FileDates>;
}

export function readVault(vault: string): VaultFiles {
  const out: VaultFiles = { notes: [], others: [], dates: new Map() };
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (SKIP.has(name)) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else {
        const rel = relative(vault, full).split("\\").join("/");
        out.dates.set(rel, { ctime: st.birthtimeMs || st.ctimeMs, mtime: st.mtimeMs });
        if (rel.endsWith(".md")) {
          const content = readFileSync(full, "utf8");
          out.notes.push({ path: rel, content, fm: readFrontmatter(content) });
        } else out.others.push(rel);
      }
    }
  };
  walk(vault);
  return out;
}

/** Einfaches Frontmatter-Lesen (Skalare und Listen auf oberster Ebene) – reicht für typ/fach/datum/tags. */
export function readFrontmatter(content: string): Record<string, unknown> | null {
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
