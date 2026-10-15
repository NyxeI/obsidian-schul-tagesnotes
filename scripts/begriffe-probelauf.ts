// Probelauf: Begriffe/Personen in Hubs und Tagesnotes finden – liest nur, schreibt nur den Bericht.
// Aufruf: node scripts/begriffe-probelauf.ts <vault> <bericht.md>
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildTerms, findMentions, type Mention, type TermNoteIn } from "../src/begriffe.ts";
import { linkList } from "../src/paths.ts";

const [vault, out] = process.argv.slice(2);
const notes: TermNoteIn[] = [];
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    if ([".obsidian", ".git", ".trash"].includes(n)) continue;
    const f = join(d, n);
    if (statSync(f).isDirectory()) walk(f);
    else if (f.endsWith(".md")) {
      const content = readFileSync(f, "utf8");
      const fmText = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      const typ = fmText.match(/^typ: (\S+)/m)?.[1];
      const themen = [...fmText.matchAll(/^\s+- "(\[\[[^"]+\]\])"/gm)].map((m) => m[1]);
      const aliases = fmText.match(/^aliases:\n((?:\s+- .*\n?)*)/m)?.[1].split("\n").map((l) => l.replace(/^\s+- /, "").trim()).filter(Boolean) ?? [];
      notes.push({ path: relative(vault, f), basename: n.replace(/\.md$/, ""), content, fm: { typ, themen, aliases } });
    }
  }
};
walk(vault);
const terms = buildTerms(notes, "02-Ressourcen/02-1-Buzzwords", "02-Ressourcen/02-2-Personen");
const targets = notes.filter((n) => (n.fm?.typ === "thema" || n.fm?.typ === "tagesnote") && /^(01-Schule|04-Projekte)\//.test(n.path));

const byTerm = new Map<string, { m: Mention; note: TermNoteIn }[]>();
for (const n of targets) for (const m of findMentions(n.content, terms, n.basename)) {
  if (!byTerm.has(m.term.name)) byTerm.set(m.term.name, []);
  byTerm.get(m.term.name)!.push({ m, note: n });
}
const rows = [...byTerm].sort((a, b) => b[1].length - a[1].length);
const total = rows.reduce((a, [, l]) => a + l.length, 0);
const lines: string[] = [
  "# Begriffe & Personen verlinken – Probelauf",
  "",
  `${terms.length} Begriffe/Personen, durchsucht: ${targets.length} Hubs und Tagesnotes. **${byTerm.size} Begriffe kommen vor, ${total} Links würden gesetzt** (je Note nur das erste Vorkommen).`,
  "",
  "Ausschließen: Begriff in die Liste am Ende schreiben (oder im Chat nennen). „häufig“ = in mehr als 10 Notes – oft ein allgemeines Wort.",
  "",
  "| Begriff | Typ | Notes | Themen-Hubs (→ Property `themen`) | Beispiele |",
  "|---|---|---|---|---|",
];
const themenOf = (n: TermNoteIn) => (n.fm?.typ === "thema" ? [n.basename] : linkList(n.fm?.themen));
for (const [name, list] of rows) {
  const t = list[0].m.term;
  const themen = [...new Set(list.flatMap((x) => themenOf(x.note)))];
  const ex = list.slice(0, 2).map((x) => `„…${x.m.context.replace(/\|/g, "\\|").slice(0, 90)}…“ (${x.note.basename})`).join("<br>");
  lines.push(`| [[${name}]]${list.length > 10 ? " ⚠️ häufig" : ""} | ${t.typ} | ${list.length} | ${themen.slice(0, 6).join(", ")}${themen.length > 6 ? ` … (+${themen.length - 6})` : ""} | ${ex} |`);
}
lines.push("", "## Ohne Treffer", "", terms.filter((t) => !byTerm.has(t.name)).map((t) => t.name).join(", "), "", "## Ausschlussliste", "", "- ");
writeFileSync(out, lines.join("\n"));
console.log(JSON.stringify({ terms: terms.length, targets: targets.length, begriffeMitTreffer: byTerm.size, links: total, top: rows.slice(0, 12).map(([n, l]) => `${n}:${l.length}`) }));
