// Probelauf Migration v2 (ein Hub pro Kategorie, alles datierte Notes) – liest nur, schreibt nur den Bericht.
// Aufruf: node scripts/probelauf2.ts <vault> <bericht.md> [bereich-id …] [--min=200] [--data=data.json]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mergeSettings, pathConfig } from "../src/defaults.ts";
import { buildPlanV2, DEFAULT_V2_OPTIONS, simpleResolver } from "../src/migration/plan2.ts";
import { renderReportV2 } from "../src/migration/report2.ts";
import { readVault } from "./lib/read-vault.ts";

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const [vault, reportPath, ...rest] = args.filter((a) => !a.startsWith("--"));
if (!vault || !reportPath) {
  console.error("Aufruf: node scripts/probelauf2.ts <vault> <bericht.md> [bereich-id …] [--min=200] [--data=data.json]");
  process.exit(1);
}
const dataPath = flag("data");
const settings = mergeSettings(dataPath && existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, "utf8")) : null);
const ids = rest.length ? rest : settings.bereiche.map((b) => b.id);
const opts = { ...DEFAULT_V2_OPTIONS, minLen: Number(flag("min") ?? DEFAULT_V2_OPTIONS.minLen) };

const v = readVault(vault);
const resolve = simpleResolver([...v.notes.map((n) => n.path), ...v.others]);
const sections: string[] = [];
const summary: Record<string, unknown> = {};
for (const id of ids) {
  const b = settings.bereiche.find((x) => x.id === id);
  if (!b) throw new Error(`Unbekannter Bereich „${id}“`);
  const plan = buildPlanV2(v.notes, v.others, v.dates, pathConfig(settings, b), resolve, opts);
  sections.push(renderReportV2(plan, b.name));
  summary[id] = { alteNotes: plan.sources.length, neueNotes: plan.parts.length, geschaetzt: plan.parts.filter((p) => p.geschaetzt).length, dateien: plan.files.length, linkNotes: plan.linkEdits.size, fehlendeAnker: plan.missingAnchors.length, warnungen: plan.warnings.length };
}
writeFileSync(reportPath, [`# Migration v2 – Probelauf`, "", `Vault: \`${vault}\` · Zusammenlegen unter ${opts.minLen} Zeichen · Teilen bis Ebene ${opts.maxLevel}`, "", ...sections].join("\n"));
console.log(JSON.stringify(summary));
