import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, bereichOf, mergeSettings, pathConfig, schule } from "../src/defaults.ts";
import { computeTarget } from "../src/paths.ts";
import { deriveTags } from "../src/tags.ts";
import { DEFAULT_TAGESNOTE_TEMPLATE, kategorieBase, renderTemplate } from "../src/templates.ts";

const projekte = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche.find((b) => b.id === "projekte")!);

test("Projekte: Zeitraum Jahr, Property projekt", () => {
  const t = computeTarget({ projekt: "[[Meshtastic]]", datum: "2026-10-15", themen: ["[[LoRa]]"] }, projekte);
  assert.equal(t?.path, "04-Projekte/Meshtastic/2026/LoRa/2026-10-15 Meshtastic.md");
  assert.equal(t?.halbjahr, null);
  assert.equal(computeTarget({ fach: "[[Meshtastic]]", datum: "2026-10-15" }, projekte), null);
});

test("Schule: Seminare und Roboterbau sind Kategorien", () => {
  const s = schule(DEFAULT_SETTINGS);
  assert.equal(computeTarget({ fach: "[[W-Seminar]]", datum: "2026-10-15" }, s)?.path, "01-Schule/W-Seminar/13-1/_Allgemein/2026-10-15 W-Seminar.md");
  assert.deepEqual(deriveTags(["#wsem"], s.kategorien.find((k) => k.name === "W-Seminar")!, ["Expose"], s.kategorien, s.tagPrefix), ["schule/wsem", "wsem/expose", "wsem"]);
});

test("Tags mit Bereichs-Präfix", () => {
  const mesh = projekte.kategorien.find((k) => k.name === "Meshtastic")!;
  assert.deepEqual(deriveTags(["projekte", "projekt/alt"], mesh, ["LoRa"], projekte.kategorien, "projekt"), ["projekt/meshtastic", "meshtastic/lora", "projekte"]);
});

test("Bereich einer Note aus ihrer Property", () => {
  assert.equal(bereichOf(DEFAULT_SETTINGS, { projekt: "[[Bonsai]]" })?.id, "projekte");
  assert.equal(bereichOf(DEFAULT_SETTINGS, { fach: "[[Mathe]]" })?.id, "schule");
  assert.equal(bereichOf(DEFAULT_SETTINGS, { fach: "[[Bonsai]]" }), null);
  assert.equal(bereichOf(DEFAULT_SETTINGS, null), null);
});

test("Template ohne Halbjahr und mit anderer Property", () => {
  const out = renderTemplate(DEFAULT_TAGESNOTE_TEMPLATE, { fach: "Bonsai", datum: "2026-10-15", halbjahr: null, themen: [], base: "", property: "projekt" });
  assert.match(out, /^---\ntyp: tagesnote\nprojekt: "\[\[Bonsai\]\]"\ndatum: 2026-10-15\nthema: ""/);
  assert.doesNotMatch(out, /halbjahr/);
});

test("Kategorie-Base: Property und Jahres-Gruppierung", () => {
  const b = kategorieBase("projekt", "jahr");
  assert.match(b, /list\(note\.projekt\)\.contains\(this\.file\.asLink\(\)\)/);
  assert.match(b, /formulas:\n  jahr: date\(datum\)\.year/);
  assert.match(b, /name: Nach Jahr\n[\s\S]*property: formula\.jahr/);
  assert.doesNotMatch(b, /halbjahr/);
  assert.doesNotMatch(kategorieBase("fach"), /formulas/);
});

test("Alte Einstellungen (v0.1) werden übernommen", () => {
  const s = mergeSettings({ root: "Schule", faecher: [{ name: "Mathe", folder: "Mathe", tag: "mathe" }], autoSort: false });
  assert.equal(s.bereiche[0].root, "Schule");
  assert.deepEqual(s.bereiche[0].kategorien.map((k) => k.name), ["Mathe"]);
  assert.equal(s.bereiche[1].id, "projekte");
  assert.equal(s.autoSort, false);
  assert.notEqual(mergeSettings(null).bereiche, DEFAULT_SETTINGS.bereiche, "Kopie, nicht dasselbe Objekt");
});
