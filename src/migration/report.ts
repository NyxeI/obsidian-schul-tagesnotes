import type { MigrationPlan } from "./plan.ts";

const esc = (s: string) => s.replace(/\|/g, "\\|");

/** Markdown-Bericht für den Probelauf. */
export function renderReport(plan: MigrationPlan, title: string): string {
  const out: string[] = [];
  const splitNotes = plan.themen.filter((t) => t.split > 0);
  const renamed = plan.themen.filter((t) => t.from.split("/").pop() !== t.to.split("/").pop());
  out.push(`# ${title}`, "");
  out.push("## Zusammenfassung", "");
  out.push(
    `| | Anzahl |`,
    `|---|---|`,
    `| Fach-Hubs (Properties + \`![[Fach.base]]\`) | ${plan.fachHubs.length} |`,
    `| Notes → Themen-Hubs in \`_Themen/\` | ${plan.themen.length} |`,
    `| davon an Datumsmarken aufgeteilt | ${splitNotes.length} |`,
    `| davon umbenannt (Namenskonflikt) | ${renamed.length} |`,
    `| neue Tagesnotes | ${plan.tagesnotes.filter((t) => !t.existing).length} |`,
    `| an vorhandene Tagesnotes angehängt | ${plan.tagesnotes.filter((t) => t.existing).length} |`,
    `| andere Dateien verschoben (Anhänge, Canvas, Ink) | ${plan.files.length} |`,
    `| Ink-Pfade umgeschrieben | ${plan.rewrites.length} |`,
    `| übersprungen | ${plan.skipped.length} |`,
    `| nicht angefasst (außerhalb der Fächer) | ${plan.untouched.length} |`,
    `| **Warnungen** | **${plan.warnings.length}** |`,
    "",
  );

  out.push("## Warnungen", "");
  out.push(...(plan.warnings.length ? plan.warnings.map((w) => `- ${w}`) : ["Keine."]), "");

  out.push("## Aufgeteilte Notes → Tagesnotes", "");
  for (const t of splitNotes) {
    out.push(`### \`${t.from}\``, `→ Hub \`${t.to}\` (Vorspann bleibt: ${t.newBody ? t.newBody.split("\n").length + " Zeilen" : "leer"})`, "");
    out.push("| Zeile | Marke | Datum | Zeilen | Tagesnote |", "|---|---|---|---|---|");
    for (const op of plan.tagesnotes) {
      for (const s of op.sources.filter((x) => x.from === t.from)) {
        out.push(`| ${s.line} | \`${esc(s.marker)}\` | ${op.datum} | ${s.lines} | \`${esc(op.path)}\`${op.existing ? " (vorhanden)" : ""} |`);
      }
    }
    out.push("");
  }

  out.push("## Tagesnotes", "", "| Datei | Themen | Quellen |", "|---|---|---|");
  for (const op of plan.tagesnotes) {
    out.push(`| \`${esc(op.path)}\`${op.existing ? " (anhängen)" : ""} | ${esc(op.themen.join(", "))} | ${op.sources.length} |`);
  }
  out.push("");

  out.push("## Fach-Hubs", "");
  for (const h of plan.fachHubs) out.push(`- \`${h.path}\` – tags: ${h.tags.join(", ")}${h.addEmbed ? " – Fach.base wird angehängt" : ""}`);
  out.push("");

  out.push("## Notes → Themen-Hubs", "", "| von | nach | kapitel |", "|---|---|---|");
  for (const t of plan.themen) out.push(`| \`${esc(t.from)}\` | \`${esc(t.to)}\` | ${esc(t.kapitel ?? "")} |`);
  out.push("");

  out.push("## Andere Dateien", "", "| von | nach |", "|---|---|");
  for (const f of plan.files) out.push(`| \`${esc(f.from)}\` | \`${esc(f.to)}\` |`);
  out.push("");

  if (plan.rewrites.length) {
    out.push("## Ink-Verweise", "");
    for (const r of plan.rewrites) out.push(`- \`${r.note}\`: ${r.search} → ${r.replace}`);
    out.push("");
  }

  out.push("## Übersprungen", "");
  for (const s of plan.skipped) out.push(`- \`${s.path}\` – ${s.reason}`);
  out.push("", "## Nicht angefasst (außerhalb der konfigurierten Fächer)", "");
  for (const p of plan.untouched) out.push(`- \`${p}\``);
  out.push("");
  return out.join("\n");
}
