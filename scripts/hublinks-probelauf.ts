// Probelauf: Linklisten in Kategorie-Hubs → Base-Ansicht „Themen nach Kapitel“ + eingeklappte alte Liste.
// Liest nur, schreibt nur den Bericht. Aufruf: node scripts/hublinks-probelauf.ts <vault> <bericht.md>
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DEFAULT_SETTINGS } from "../src/defaults.ts";
import { planHubLinks } from "../src/hublinks.ts";

const [vault, out] = process.argv.slice(2);
// Basename → Pfade, und Frontmatter-Kurzinfo der Notes
const byName = new Map<string, string[]>();
const info = new Map<string, { typ?: string; kat?: string }>();
const walk = (d: string) => {
  for (const n of readdirSync(d)) {
    if ([".obsidian", ".git", ".trash"].includes(n)) continue;
    const f = join(d, n);
    if (statSync(f).isDirectory()) walk(f);
    else {
      const rel = relative(vault, f);
      for (const key of [n, n.replace(/\.md$/, "")]) byName.set(key, [...(byName.get(key) ?? []), rel]);
      if (n.endsWith(".md")) {
        const fm = readFileSync(f, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
        info.set(rel, { typ: fm.match(/^typ: (\S+)/m)?.[1], kat: fm.match(/^(?:fach|projekt): "?\[\[([^\]|]+)/m)?.[1] });
      }
    }
  }
};
walk(vault);

const lines = [
  "# Linklisten in den Fach-Hubs ersetzen – Probelauf",
  "",
  "Vorschlag: Die handgeschriebene Linkliste oben im Hub wird zu einem **eingeklappten Callout** „Alte Linkliste (vor der Umstellung)“. Darüber steht die neue Ansicht **„Themen nach Kapitel“** (`![[Fach.base#Themen nach Kapitel]]`): alle Themen-Hubs des Fachs, gruppiert nach dem alten Ordner (`kapitel`). Die Tagesnotes-Übersicht darunter bleibt. Es geht nichts verloren, die Links (und Backlinks) bleiben im Callout erhalten; löschen kannst du ihn später von Hand.",
  "",
  "„Nicht in der Base“ = Links der alten Liste, die die Ansicht nicht zeigt (Canvas, Notes in anderen Fächern/Ordnern, tote Links). Die bleiben über den Callout erreichbar.",
  "",
  "| Hub | Aktion | Zeilen | Links | davon in der Base | nicht in der Base |",
  "|---|---|---|---|---|---|",
];
let n = 0;
for (const b of DEFAULT_SETTINGS.bereiche) {
  const baseName = b.kategorieBasePath.split("/").pop()!;
  for (const k of b.kategorien) {
    const hub = join(b.root, k.folder, `${k.name}.md`);
    if (!existsSync(join(vault, hub))) {
      lines.push(`| ${k.name} | – (Hub fehlt) | | | | |`);
      continue;
    }
    const p = planHubLinks(readFileSync(join(vault, hub), "utf8"), baseName);
    const inBase: string[] = [];
    const fremd: string[] = [];
    for (const l of p.links) {
      const paths = byName.get(l) ?? byName.get(l.split("/").pop()!) ?? [];
      const ok = paths.some((x) => info.get(x)?.typ === "thema" && info.get(x)?.kat === k.name);
      if (ok) inBase.push(l);
      else fremd.push(paths.length ? `${l} (${paths[0].endsWith(".md") ? info.get(paths[0])?.typ ?? "ohne typ" : paths[0].split(".").pop()}${paths[0].startsWith(join(b.root, k.folder)) ? "" : ", " + paths[0].split("/").slice(0, 2).join("/")})` : `${l} (tot)`);
    }
    if (p.content) n++;
    lines.push(`| [[${hub.replace(/\.md$/, "")}\\|${k.name}]] | ${p.content ? "**umstellen**" : `bleibt: ${p.grund}`} | ${p.zeilen || ""} | ${p.links.length} | ${inBase.length} | ${fremd.join(", ").replace(/\|/g, "\\|")} |`);
  }
}
lines.splice(2, 0, `**${n} Hubs würden umgestellt.**`, "");
writeFileSync(out, lines.join("\n") + "\n");
console.log(`${n} Hubs`);
