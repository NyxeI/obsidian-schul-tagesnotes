// Bericht für Migration v2 (pure): Übersicht je Kategorie, dann jede alte Note mit ihren neuen Teilen.
import type { PartOp, PlanV2 } from "./plan2.ts";

const esc = (s: string) => s.replace(/\|/g, "\\|");

function partLine(p: PartOp): string {
  const datum = p.geschaetzt ? `${p.datum} ≈` : p.datum;
  const abschnitt = p.abschnitt ? ` „${p.abschnitt}“` : "";
  return `${p.basename} · ${datum}${abschnitt} · ${p.zeichen} Z.`;
}

export function renderReportV2(plan: PlanV2, bereich: string): string {
  const out: string[] = [`## ${bereich}`, ""];
  const fächer = [...new Set(plan.sources.map((s) => s.fach))];
  const geschaetzt = plan.parts.filter((p) => p.geschaetzt).length;
  out.push(
    `**${plan.sources.length} alte Notes → ${plan.parts.length} datierte Notes** (davon ${geschaetzt} mit geschätztem Datum ≈). ` +
      `${plan.files.length} Dateien wandern nach \`<Kategorie>/attachments/\`. ` +
      `In ${plan.linkEdits.size} weiteren Notes werden ${[...plan.linkEdits.values()].reduce((a, b) => a + b, 0)} Links umgeleitet.`,
    "",
    "| Kategorie | alte Notes | neue Notes | geschätzt ≈ | Zeitraum der Daten | größte Aufteilung |",
    "|---|---|---|---|---|---|",
  );
  for (const f of fächer) {
    const src = plan.sources.filter((s) => s.fach === f);
    const parts = plan.parts.filter((p) => p.fach === f);
    const daten = parts.map((p) => p.datum).sort();
    const max = [...src].sort((a, b) => b.parts - a.parts)[0];
    out.push(
      `| ${f} | ${src.length} | ${parts.length} | ${parts.filter((p) => p.geschaetzt).length} | ${daten[0] ?? ""} – ${daten[daten.length - 1] ?? ""} | ${max ? `${esc(max.thema)} (${max.parts})` : ""} |`,
    );
  }
  out.push("");

  if (plan.warnings.length) {
    out.push(`> [!warning]- Warnungen (${plan.warnings.length})`, ...plan.warnings.map((w) => `> - ${w}`), "");
  }
  if (plan.missingAnchors.length) {
    out.push(
      `> [!warning]- Links auf Überschriften, die es nicht (mehr) gibt (${plan.missingAnchors.length}) – zeigen danach auf Teil 1`,
      ...plan.missingAnchors.map((m) => `> - ${m}`),
      "",
    );
  }

  for (const f of fächer) {
    const src = plan.sources.filter((s) => s.fach === f);
    out.push(`> [!example]- ${f}: ${src.length} alte Notes → ${plan.parts.filter((p) => p.fach === f).length} neue`);
    for (const s of src) {
      const parts = plan.parts.filter((p) => p.from === s.from);
      const ort = parts[0] ? parts[0].path.split("/").slice(0, -1).join("/") : "";
      out.push(`> - **${s.thema}**${s.kapitel ? ` (${s.kapitel})` : ""} → ${parts.length === 1 ? "1 Note" : `${parts.length} Notes`} in \`${ort}\``);
      if (parts.length > 1 || parts[0]?.abschnitt) for (const p of parts) out.push(`>   - ${partLine(p)}`);
      else if (parts[0]) out.push(`>   - ${partLine(parts[0])}`);
    }
    out.push("");
  }

  if (plan.skipped.length) {
    out.push(`> [!info]- Unverändert gelassen (${plan.skipped.length})`, ...plan.skipped.map((s) => `> - \`${s.path}\` – ${s.reason}`), "");
  }
  if (plan.untouched.length) {
    out.push(`> [!info]- Außerhalb der Kategorien (${plan.untouched.length}, bleiben liegen)`, ...plan.untouched.map((p) => `> - \`${p}\``), "");
  }
  if (plan.linkEdits.size) {
    out.push(
      `> [!info]- Notes mit umgeleiteten Links (${plan.linkEdits.size})`,
      ...[...plan.linkEdits].sort((a, b) => b[1] - a[1]).map(([p, n]) => `> - \`${p}\`: ${n}`),
      "",
    );
  }
  return out.join("\n");
}
