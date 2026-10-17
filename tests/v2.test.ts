import { test } from "node:test";
import assert from "node:assert/strict";
import { h3Headings, headingKey, splitHeadings } from "../src/migration/headings.ts";
import { rewriteCanvas, rewriteLinks, type SplitTarget } from "../src/migration/links.ts";
import { buildPlanV2, estimatedDate, simpleResolver } from "../src/migration/plan2.ts";
import { computeTarget, freeTagesnoteName, suffixNumber, tagesnoteName, themaOf } from "../src/paths.ts";
import { DEFAULT_SETTINGS, pathConfig } from "../src/defaults.ts";

const opts = { maxLevel: 2, minLen: 20 };

test("splitHeadings: teilt an # und ##, ### bleibt im Teil, Code-Blöcke zählen nicht", () => {
  const body = [
    "# Woyzeck",
    "Einleitung zum Drama, lang genug.",
    "## Hauptmann",
    "Szene mit dem Hauptmann, lang genug.",
    "### Detail",
    "Mehr Text hier im Detail.",
    "```",
    "## kein Abschnitt",
    "```",
    "## Doktor",
    "Der Doktor als Aggressor, lang genug.",
  ].join("\n");
  const parts = splitHeadings(body, opts);
  assert.deepEqual(parts.map((p) => p.heading), ["Woyzeck", "Hauptmann", "Doktor"]);
  assert.match(parts[1].text, /### Detail[\s\S]*## kein Abschnitt/);
  assert.deepEqual(parts[1].anchors, ["hauptmann", "detail"]);
});

test("splitHeadings: kurze Abschnitte und kurzer Vorspann werden zusammengelegt", () => {
  const parts = splitHeadings("Kurz.\n## A\nText A ist lang genug hier.\n## B\nx\n## C\nText C ist lang genug hier.", opts);
  assert.deepEqual(parts.map((p) => p.heading), ["A", "C"]);
  assert.match(parts[0].text, /^Kurz\.\n\n## A[\s\S]*## B\nx$/);
  assert.deepEqual(splitHeadings("Nur Text ohne Überschrift, aber lang.", opts).map((p) => p.heading), [null]);
  assert.deepEqual(h3Headings("### Eins\ntext\n## Zwei\n### **Drei**"), ["Eins", "Drei"]);
  assert.equal(headingKey("**Fett**  und [[Link|Alias]]"), "fett und alias");
});

const target: SplitTarget = {
  title: "Woyzeck",
  parts: [
    { basename: "2025-03-14 Deutsch", path: "D/12-1/Woyzeck/2025-03-14 Deutsch.md", anchors: ["woyzeck", "^abc"] },
    { basename: "2025-03-14 Deutsch (2)", path: "D/12-1/Woyzeck/2025-03-14 Deutsch (2).md", anchors: ["doktor"] },
  ],
};
const targets = new Map([["D/Woyzeck.md", target]]);
const resolve = (lp: string) => (lp === "Woyzeck" ? "D/Woyzeck.md" : null);

test("rewriteLinks: Ziel, Anker, Alias, Einbettung, Tabelle, Markdown-Link, Code bleibt", () => {
  const src = [
    "[[Woyzeck]] und [[Woyzeck#Doktor]] und [[Woyzeck#Doktor|der Arzt]]",
    "![[Woyzeck#Doktor]] | [[Woyzeck#Doktor\\|T]] | [[Woyzeck#^abc]]",
    "[Text](Woyzeck.md#Doktor) `[[Woyzeck]]` [[Anderes]] [[Woyzeck#Fehlt]]",
  ].join("\n");
  const r = rewriteLinks(src, resolve, targets);
  assert.equal(
    r.content,
    [
      "[[2025-03-14 Deutsch|Woyzeck]] und [[2025-03-14 Deutsch (2)#Doktor|Woyzeck > Doktor]] und [[2025-03-14 Deutsch (2)#Doktor|der Arzt]]",
      "![[2025-03-14 Deutsch (2)#Doktor]] | [[2025-03-14 Deutsch (2)#Doktor\\|T]] | [[2025-03-14 Deutsch#^abc|Woyzeck > ^abc]]",
      "[Text](<D/12-1/Woyzeck/2025-03-14 Deutsch (2).md#Doktor>) `[[Woyzeck]]` [[Anderes]] [[2025-03-14 Deutsch#Fehlt|Woyzeck > Fehlt]]",
    ].join("\n"),
  );
  assert.deepEqual(r.missing, ["Woyzeck#Fehlt"]);
});

test("rewriteLinks: [[#Überschrift]] innerhalb einer aufgeteilten Note", () => {
  const self = { oldPath: "D/Woyzeck.md", basename: "2025-03-14 Deutsch" };
  assert.equal(rewriteLinks("siehe [[#Doktor]]", resolve, targets, self).content, "siehe [[2025-03-14 Deutsch (2)#Doktor|Doktor]]");
  assert.equal(rewriteLinks("siehe [[#Woyzeck]]", resolve, targets, self).content, "siehe [[#Woyzeck]]");
});

test("rewriteCanvas: Dateiknoten auf den Teil mit dem Anker", () => {
  const json = JSON.stringify({ nodes: [{ type: "file", file: "D/Woyzeck.md", subpath: "#Doktor" }, { type: "text", text: "x" }] });
  const r = rewriteCanvas(json, targets);
  assert.equal(r.changed, 1);
  assert.equal(JSON.parse(r.content).nodes[0].file, "D/12-1/Woyzeck/2025-03-14 Deutsch (2).md");
});

test("Pfade: thema als Text, Namen mit Suffix", () => {
  assert.deepEqual(themaOf({ thema: "Geraden" }), ["Geraden"]);
  assert.deepEqual(themaOf({ thema: "[[Geraden]]" }), ["Geraden"]);
  assert.deepEqual(themaOf({ themen: ["[[Alt]]"] }), ["Alt"]);
  const cfg = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche[0]);
  assert.equal(computeTarget({ fach: "[[Mathe]]", datum: "2025-03-14", thema: "Geraden" }, cfg)!.path, "01-Schule/Mathe/11-2/Geraden/2025-03-14 Mathe.md");
  assert.equal(tagesnoteName("2025-03-14 Mathe", 3), "2025-03-14 Mathe (3)");
  assert.equal(suffixNumber("2025-03-14 Mathe (3)", "2025-03-14 Mathe"), 3);
  assert.equal(suffixNumber("2025-03-14 Mathe", "2025-03-14 Mathe"), 1);
  assert.equal(suffixNumber("2025-03-14 Physik", "2025-03-14 Mathe"), null);
  const used = new Set(["2025-03-14 Mathe", "2025-03-14 Mathe (2)"]);
  assert.equal(freeTagesnoteName("2025-03-14 Mathe", (n) => used.has(n)), "2025-03-14 Mathe (3)");
});

test("Geschätztes Datum: früheres von Erstellt und Geändert", () => {
  const d = (s: string) => new Date(`${s}T12:00:00`).getTime();
  assert.equal(estimatedDate({ ctime: d("2025-12-23"), mtime: d("2025-03-14") }, "x"), "2025-03-14");
  assert.equal(estimatedDate({ ctime: d("2026-02-01"), mtime: d("2026-05-02") }, "x"), "2026-02-01");
  assert.equal(estimatedDate(undefined, "2026-10-17"), "2026-10-17");
});

test("buildPlanV2: Teile mit Datum, eindeutige Namen, Links umgeleitet, Hub und Anhänge", () => {
  const cfg = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche[0]);
  const notes = [
    { path: "01-Schule/Deutsch/Deutsch.md", content: "[[Woyzeck#Doktor]]\n", fm: null },
    {
      path: "01-Schule/Deutsch/Dramen/Woyzeck.md",
      content: "---\naliases: [Büchner]\nbanner: x\n---\n# Woyzeck\nEinleitung zum Drama von Büchner, lang genug für einen eigenen Teil.\n## Doktor\nDer Doktor als Aggressor, mit genug Text für einen eigenen Teil. Siehe [[#Woyzeck]].\n",
      fm: { aliases: ["Büchner"], banner: "x" },
    },
    { path: "01-Schule/Deutsch/Dramen/Faust.md", content: "Faust, ohne Überschrift.\n\n## 14.03.2025\nStunde zu Faust.\n", fm: null },
  ];
  const day = new Date("2025-03-14T10:00:00").getTime();
  const dates = new Map(notes.map((n) => [n.path, { ctime: Date.now(), mtime: day }]));
  const others = ["01-Schule/Deutsch/Dramen/bild.png"];
  const plan = buildPlanV2(notes, others, dates, cfg, simpleResolver([...notes.map((n) => n.path), ...others]), { maxLevel: 2, minLen: 20 }, "2026-10-17");
  assert.deepEqual(
    plan.parts.map((p) => [p.basename, p.thema, p.abschnitt, p.geschaetzt, p.teil, p.von]),
    [
      ["2025-03-14 Deutsch", "Faust", null, true, 1, 2],
      ["2025-03-14 Deutsch (2)", "Faust", null, false, 2, 2],
      ["2025-03-14 Deutsch (3)", "Woyzeck", "Woyzeck", true, 1, 2],
      ["2025-03-14 Deutsch (4)", "Woyzeck", "Doktor", true, 2, 2],
    ],
  );
  const doktor = plan.parts[3];
  assert.equal(doktor.path, "01-Schule/Deutsch/11-2/Woyzeck/2025-03-14 Deutsch (4).md");
  assert.match(doktor.content, /^---\ntyp: tagesnote\nfach: "\[\[Deutsch\]\]"\ndatum: 2025-03-14\nhalbjahr: 11-2\nthema: Woyzeck\nabschnitt: Doktor\nteil: 2\/2\nkapitel: Dramen\nquelle: 01-Schule\/Deutsch\/Dramen\/Woyzeck\.md\ndatum_geschaetzt: true\n/);
  assert.match(doktor.content, /\[\[2025-03-14 Deutsch \(3\)#Woyzeck\|Woyzeck\]\]/);
  // Alias und fremde Properties nur in Teil 1
  assert.match(plan.parts[2].content, /aliases:\n  - Büchner[\s\S]*banner: x/);
  assert.doesNotMatch(doktor.content, /banner/);
  assert.equal(plan.linkEdits.get("01-Schule/Deutsch/Deutsch.md"), 1);
  assert.deepEqual(plan.files, [{ from: "01-Schule/Deutsch/Dramen/bild.png", to: "01-Schule/Deutsch/attachments/Dramen/bild.png" }]);
  const hub = plan.fachHubs.find((h) => h.fach === "Deutsch")!;
  assert.equal(hub.path, "01-Schule/Deutsch/Deutsch.md");
  assert.equal(hub.create, undefined);
});
