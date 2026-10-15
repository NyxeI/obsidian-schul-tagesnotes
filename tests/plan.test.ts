import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, renderTagesnote, type NoteIn } from "../src/migration/plan.ts";
import { DEFAULT_SETTINGS, schule } from "../src/defaults.ts";

const cfg = schule(DEFAULT_SETTINGS);

const note = (path: string, content: string, fm: Record<string, unknown> | null = null): NoteIn => ({ path, content, fm });

const vault: NoteIn[] = [
  note("01-Schule/Mathe/Mathe.md", "---\nbanner: x\n---\n#Mathe\n", { banner: "x" }),
  note("01-Schule/Mathe/Geraden.md", "16-09-2026\n#schule\n\nGeraden-Inhalt"),
  note("01-Schule/Mathe/Stochastik/Kombinatorik.md", "Intro\n---\n02-10-2026\nKombi\n---\n09-10-2026\nMehr"),
  note("01-Schule/Mathe/11/Wurzel/Übersicht.md", "a"),
  note("01-Schule/Mathe/Stochastik/Übersicht.md", "b"),
  note("01-Schule/Mathe/Bild.excalidraw.md", "x", { "excalidraw-plugin": "parsed" }),
  note("01-Schule/Deutsch/Woyzeck.md", "W\n---\n02-10-2026\nWoyzeck-Stunde"),
  note("01-Schule/Deutsch/Deutsch.md", "![[Fach.base]]"),
  note("01-Schule/Hausaufgaben oder To - Do.md", "## 07.10.25\nHA"),
  note("01-Schule/Mathe/13-1/Geraden/2026-10-15 Mathe.md", "---\n", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15" }),
];
const files = [
  "01-Schule/Mathe/Stochastik/attachments/baum.png",
  "01-Schule/Mathe/Stochastik/Karte.canvas",
  "01-Schule/Mathe/attachments/schon-da.png",
  "01-Schule/Mathe/Stochastik/attachments/Ink/Drawing/a.drawing",
];
vault.push(note("01-Schule/Mathe/Stochastik/Ink-Note.md", '```handdrawn-ink\n{"filepath": "01-Schule/Mathe/Stochastik/attachments/Ink/Drawing/a.drawing"}\n```'));
vault.push(note("01-Schule/Mathe/Alt-Ink.md", '```handdrawn-ink\n{"filepath": "11. Klasse/Mathe/attachments/Ink/Drawing/a.drawing"}\n```\n```handdrawn-ink\n{"filepath": "weg/b.drawing"}\n```'));

const plan = buildPlan(vault, files, cfg);

test("Fach-Hubs bekommen Tags; Embed nur wenn noch nicht vorhanden; fehlender Hub wird angelegt", () => {
  const mathe = plan.fachHubs.find((h) => h.fach === "Mathe")!;
  assert.deepEqual(mathe.tags, ["schule/mathe"]);
  assert.equal(mathe.addEmbed, true);
  assert.equal(plan.fachHubs.find((h) => h.fach === "Deutsch")!.addEmbed, false);
  assert.ok(plan.warnings.some((w) => w.includes("Kein Hub für Physik")));
  assert.match(plan.fachHubs.find((h) => h.fach === "Physik")!.create!, /typ: fach\ntags:\n  - schule\/physik/);
});

test("Notes wandern nach _Themen, Kapitel aus altem Pfad, Konflikte werden umbenannt", () => {
  const by = (from: string) => plan.themen.find((t) => t.from === from)!;
  assert.equal(by("01-Schule/Mathe/Geraden.md").to, "01-Schule/Mathe/_Themen/Geraden.md");
  assert.equal(by("01-Schule/Mathe/Stochastik/Kombinatorik.md").kapitel, "Stochastik");
  assert.equal(by("01-Schule/Mathe/11/Wurzel/Übersicht.md").to, "01-Schule/Mathe/_Themen/Übersicht.md");
  assert.equal(by("01-Schule/Mathe/Stochastik/Übersicht.md").to, "01-Schule/Mathe/_Themen/Übersicht (Stochastik).md");
  assert.deepEqual(by("01-Schule/Mathe/Stochastik/Kombinatorik.md").tags, ["schule/mathe", "mathe/kombinatorik"]);
});

test("Datierte Abschnitte werden zu Tagesnotes, Vorspann bleibt im Hub", () => {
  const kombi = plan.themen.find((t) => t.from.endsWith("Kombinatorik.md"))!;
  assert.equal(kombi.newBody, "Intro");
  assert.equal(kombi.split, 2);
  const geraden = plan.themen.find((t) => t.from.endsWith("Mathe/Geraden.md"))!;
  assert.equal(geraden.newBody, "");
  const paths = plan.tagesnotes.map((t) => t.path);
  assert.ok(paths.includes("01-Schule/Mathe/13-1/Geraden/2026-09-16 Mathe.md"));
  assert.ok(paths.includes("01-Schule/Mathe/13-1/Kombinatorik/2026-10-02 Mathe.md"));
  assert.ok(paths.includes("01-Schule/Deutsch/13-1/Woyzeck/2026-10-02 Deutsch.md"));
  const t = plan.tagesnotes.find((x) => x.path.endsWith("2026-10-09 Mathe.md"))!;
  const content = renderTagesnote(t, cfg.kategorien.find((f) => f.name === "Mathe")!, cfg);
  assert.match(content, /typ: tagesnote\nfach: "\[\[Mathe\]\]"\ndatum: 2026-10-09\nhalbjahr: 13-1\nthemen:\n  - "\[\[Kombinatorik\]\]"\ntags:\n  - schule\/mathe\n  - mathe\/kombinatorik\nmigriert: true/);
  assert.match(content, /## Kombinatorik\n\nMehr/);
});

test("Übersprungen und unangetastet", () => {
  const reasons = Object.fromEntries(plan.skipped.map((s) => [s.path, s.reason]));
  assert.equal(reasons["01-Schule/Mathe/Bild.excalidraw.md"], "Excalidraw-Zeichnung");
  assert.equal(reasons["01-Schule/Mathe/13-1/Geraden/2026-10-15 Mathe.md"], "bereits Tagesnote");
  assert.ok(plan.untouched.includes("01-Schule/Hausaufgaben oder To - Do.md"));
});

test("Anhänge nach Fach/attachments, Canvas nach _Themen, Ink-Pfade werden umgeschrieben", () => {
  const to = Object.fromEntries(plan.files.map((f) => [f.from, f.to]));
  assert.equal(to["01-Schule/Mathe/Stochastik/attachments/baum.png"], "01-Schule/Mathe/attachments/Stochastik/baum.png");
  assert.equal(to["01-Schule/Mathe/Stochastik/Karte.canvas"], "01-Schule/Mathe/_Themen/Karte.canvas");
  assert.equal(to["01-Schule/Mathe/attachments/schon-da.png"], undefined);
  const neu = '"01-Schule/Mathe/attachments/Stochastik/Ink/Drawing/a.drawing"';
  assert.deepEqual(plan.rewrites, [
    { note: "01-Schule/Mathe/Stochastik/Ink-Note.md", search: '"01-Schule/Mathe/Stochastik/attachments/Ink/Drawing/a.drawing"', replace: neu },
    { note: "01-Schule/Mathe/Alt-Ink.md", search: '"11. Klasse/Mathe/attachments/Ink/Drawing/a.drawing"', replace: neu },
  ]);
  assert.ok(plan.warnings.some((w) => w.includes("weg/b.drawing")));
});

test("Projekte: Hub umbenennen, fehlenden Hub anlegen, Jahr als Zeitraum", async () => {
  const { pathConfig } = await import("../src/defaults.ts");
  const proj = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche.find((b) => b.id === "projekte")!);
  const p = buildPlan(
    [
      note("04-Projekte/Linux/Linux Hub.md", "Hub"),
      note("04-Projekte/Linux/Begriffe/Daemon.md", "D"),
      note("04-Projekte/Meshtastic/Meshtastic.md", "M"),
      note("04-Projekte/Meshtastic/LoRa.md", "Intro\n---\n03-05-2026\nTest"),
    ],
    [],
    proj,
  );
  const linux = p.fachHubs.find((h) => h.fach === "Linux")!;
  assert.equal(linux.renameFrom, "04-Projekte/Linux/Linux Hub.md");
  assert.equal(linux.path, "04-Projekte/Linux/Linux.md");
  const bonsai = p.fachHubs.find((h) => h.fach === "Bonsai")!;
  assert.match(bonsai.create!, /^---\ntyp: projekt\ntags:\n  - projekt\/bonsai\n---\n# Bonsai\n\n## Übersicht\n!\[\[Projekt\.base\]\]/);
  assert.ok(!p.themen.some((t) => t.from.endsWith("Linux Hub.md")), "Hub wird nicht zum Themen-Hub");
  assert.equal(p.themen.find((t) => t.from.endsWith("Daemon.md"))!.to, "04-Projekte/Linux/_Themen/Daemon.md");
  assert.equal(p.tagesnotes[0].path, "04-Projekte/Meshtastic/2026/LoRa/2026-05-03 Meshtastic.md");
  const content = renderTagesnote(p.tagesnotes[0], proj.kategorien.find((k) => k.name === "Meshtastic")!, proj);
  assert.match(content, /typ: tagesnote\nprojekt: "\[\[Meshtastic\]\]"\ndatum: 2026-05-03\nthemen:/);
  assert.doesNotMatch(content, /halbjahr/);
});
