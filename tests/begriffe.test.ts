import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMentions, buildTerms, findMentions, personForms, protectedRanges } from "../src/begriffe.ts";

const terms = buildTerms(
  [
    { path: "R/B/Chiasmus.md", basename: "Chiasmus", content: "", fm: null },
    { path: "R/B/Ballade.md", basename: "Ballade", content: "", fm: { aliases: ["Balladen"] } },
    { path: "R/B/Ich.md", basename: "Ich", content: "", fm: null },
    { path: "R/P/Johan Gottfried Herder.md", basename: "Johan Gottfried Herder", content: "", fm: null },
    { path: "X/Andere.md", basename: "Andere", content: "", fm: null },
  ],
  "R/B",
  "R/P",
);

test("Begriffe und Personen mit Schreibweisen", () => {
  assert.deepEqual(terms.map((t) => [t.name, t.typ, t.forms]), [
    ["Chiasmus", "begriff", ["Chiasmus"]],
    ["Ballade", "begriff", ["Ballade", "Balladen"]],
    ["Johan Gottfried Herder", "person", ["Johan Gottfried Herder", "Herder"]],
  ]);
  assert.deepEqual(personForms("Kant", []), ["Kant"]);
});

test("Erstes Vorkommen, ganze Wörter, längerer Treffer gewinnt", () => {
  const c = "Herder schrieb. Johan Gottfried Herder und ein Chiasmus. Noch ein Chiasmus. Chiasmusse nicht.";
  const m = findMentions(c, terms, "Note");
  assert.deepEqual(m.map((x) => [x.term.name, x.text]), [["Johan Gottfried Herder", "Herder"], ["Chiasmus", "Chiasmus"]]);
  assert.equal(applyMentions(c, m), "[[Johan Gottfried Herder|Herder]] schrieb. Johan Gottfried Herder und ein [[Chiasmus]]. Noch ein Chiasmus. Chiasmusse nicht.");
});

test("Geschützt: Frontmatter, Überschriften, Code, Formeln, Links, Tags; schon verlinkt; eigene Note", () => {
  const c = "---\nthema: Chiasmus\n---\n# Chiasmus\n`Chiasmus` $Chiasmus$ [[Ballade]] #Chiasmus\n```\nChiasmus\n```\nBalladen hier";
  assert.deepEqual(findMentions(c, terms, "Note").map((x) => x.text), []);
  assert.deepEqual(findMentions("chiasmus im Text", terms, "Note").map((x) => x.text), ["chiasmus"]);
  assert.deepEqual(findMentions("Chiasmus", terms, "Chiasmus"), []);
  assert.ok(protectedRanges("[a](http://x) b").length >= 1);
});

test("Groß/klein: Link behält die Schreibweise der Note", () => {
  const m = findMentions("die balladen von", terms, "N");
  assert.equal(applyMentions("die balladen von", m), "die [[Ballade|balladen]] von");
});

test("In Tabellen wird der Alias-Trenner escaped", () => {
  const c = "| Jahr | Autor |\n|---|---|\n| 1774 | Herder |";
  assert.equal(applyMentions(c, findMentions(c, terms, "N")), "| Jahr | Autor |\n|---|---|\n| 1774 | [[Johan Gottfried Herder\\|Herder]] |");
});

test("Thema.base: Typ-Filter wandert in die Ansichten, Begriffe-Ansicht kommt dazu", async () => {
  const { DEFAULT_THEMA_BASE, addBegriffeToThemaBase, kategorieBase, addBegriffeToKategorieBase } = await import("../src/templates.ts");
  const out = addBegriffeToThemaBase(DEFAULT_THEMA_BASE);
  assert.match(out, /^filters:\n  and:\n    - file\.ext == "md"\nviews:/m);
  const views = out.split("  - type: table").slice(1);
  assert.equal(views.length, 6);
  for (const v of views.slice(0, 5)) assert.match(v, /contains\(this\.file\.asLink\(\)\)\n        - typ == "tagesnote"/);
  assert.match(views[5], /name: Begriffe[\s\S]*typ == "begriff"[\s\S]*typ == "person"/);
  assert.equal(addBegriffeToThemaBase(out), out, "idempotent");
  assert.match(addBegriffeToKategorieBase(kategorieBase("fach")), /name: Begriffe\n[\s\S]*list\(note\.kategorien\)/);
});
