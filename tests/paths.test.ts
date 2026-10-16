import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFaecher, parseHalbjahre, tagSlug, type PathConfig } from "../src/config.ts";
import { computeTarget, fachFromPath, halbjahrFor, linkList, linkTarget, normalizeDate, today } from "../src/paths.ts";
import { deriveTags, tagList } from "../src/tags.ts";
import { DEFAULT_TAGESNOTE_TEMPLATE, renderTemplate } from "../src/templates.ts";

const cfg: PathConfig = {
  id: "schule",
  name: "Schule",
  root: "01-Schule",
  property: "fach",
  tagPrefix: "schule",
  zeitraum: "halbjahr",
  hubFolder: "_Themen",
  generalFolder: "_Allgemein",
  noHalbjahrFolder: "_Ohne Halbjahr",
  fileNamePattern: "{datum} {fach}",
  tagesnoteTemplate: "",
  hubTemplate: "",
  kategorieBasePath: "Fach.base",
  themaBasePath: "Thema.base",
  kategorien: parseFaecher("Mathe\nPolitik und Gesellschaft | Politik und Gesellschaft | politik\nFranzösisch"),
  halbjahre: parseHalbjahre("12-1 | 2026-09-08 | 2027-02-12\n12-2 | 2027-02-13 | 2027-09-13\nkaputt | 2026 | x"),
};

test("Konfiguration wird aus Zeilen gelesen", () => {
  assert.deepEqual(cfg.kategorien[0], { name: "Mathe", folder: "Mathe", tag: "mathe" });
  assert.equal(cfg.kategorien[1].tag, "politik");
  assert.equal(cfg.kategorien[2].tag, "franzoesisch");
  assert.equal(cfg.halbjahre.length, 2);
});

test("tagSlug macht Tags klein und ohne Umlaute/Leerzeichen", () => {
  assert.equal(tagSlug("Lokales und globales Differenzieren"), "lokales-und-globales-differenzieren");
  assert.equal(tagSlug("Binärbaum"), "binaerbaum");
  assert.equal(tagSlug("I. Grundideen der Quantenphysik"), "i-grundideen-der-quantenphysik");
  assert.equal(tagSlug("Faust I / II"), "faust-i-ii");
});

test("Datum und Halbjahr", () => {
  assert.equal(normalizeDate("2026-10-15"), "2026-10-15");
  assert.equal(normalizeDate(new Date("2026-10-15T00:00:00Z")), "2026-10-15");
  assert.equal(normalizeDate("15-10-2026"), null);
  assert.equal(halbjahrFor("2026-09-08", cfg.halbjahre), "12-1");
  assert.equal(halbjahrFor("2027-02-12", cfg.halbjahre), "12-1");
  assert.equal(halbjahrFor("2027-02-13", cfg.halbjahre), "12-2");
  assert.equal(halbjahrFor("2025-01-01", cfg.halbjahre), null);
  assert.equal(today(new Date(2026, 0, 5)), "2026-01-05");
});

test("Links werden auf den Notiznamen reduziert", () => {
  assert.equal(linkTarget("[[Geraden]]"), "Geraden");
  assert.equal(linkTarget("[[01-Schule/Mathe/_Themen/Geraden|Geraden-Hub]]"), "Geraden");
  assert.equal(linkTarget("[[Geraden#Lage]]"), "Geraden");
  assert.equal(linkTarget("Geraden.md"), "Geraden");
  assert.equal(linkTarget(""), null);
  assert.equal(linkTarget(42), null);
  assert.deepEqual(linkList(["[[A]]", "[[A]]", null, "[[B]]"]), ["A", "B"]);
  assert.deepEqual(linkList("[[A]]"), ["A"]);
  assert.deepEqual(linkList(undefined), []);
});

test("Zielpfad: Fach / Halbjahr / Thema / Datum Fach", () => {
  const t = computeTarget({ fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Geraden]]", "[[Ebenen]]"] }, cfg);
  assert.equal(t?.path, "01-Schule/Mathe/12-1/Geraden/2026-10-15 Mathe.md");
  assert.equal(t?.halbjahr, "12-1");
  assert.deepEqual(t?.themen, ["Geraden", "Ebenen"]);
});

test("Zielpfad ohne Thema, ohne Halbjahr, mit unerlaubten Zeichen", () => {
  assert.equal(
    computeTarget({ fach: "[[Mathe]]", datum: "2026-10-15", themen: [] }, cfg)?.path,
    "01-Schule/Mathe/12-1/_Allgemein/2026-10-15 Mathe.md",
  );
  assert.equal(
    computeTarget({ fach: "Mathe", datum: "2024-01-01" }, cfg)?.path,
    "01-Schule/Mathe/_Ohne Halbjahr/_Allgemein/2024-01-01 Mathe.md",
  );
  assert.equal(
    computeTarget({ fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Was ist: Stochastik?]]"] }, cfg)?.folder,
    "01-Schule/Mathe/12-1/Was ist Stochastik",
  );
});

test("Ohne bekanntes Fach oder Datum gibt es keinen Zielpfad", () => {
  assert.equal(computeTarget({ fach: "[[Latein]]", datum: "2026-10-15" }, cfg), null);
  assert.equal(computeTarget({ fach: "[[Mathe]]" }, cfg), null);
  assert.equal(computeTarget(null, cfg), null);
});

test("Fach aus dem Pfad", () => {
  assert.equal(fachFromPath("01-Schule/Mathe/_Themen/Geraden.md", cfg)?.name, "Mathe");
  assert.equal(fachFromPath("02-Ressourcen/Mathe.md", cfg), null);
});

test("Tags: verwaltete werden ersetzt, eigene bleiben", () => {
  const mathe = cfg.kategorien[0];
  assert.deepEqual(tagList("#a, b"), ["a", "b"]);
  assert.deepEqual(
    deriveTags(["#Abi_Relevant", "schule/politik", "mathe/alt", "politik/x"], mathe, ["Geraden", "Lage von Ebenen"], cfg.kategorien),
    ["schule/mathe", "mathe/geraden", "mathe/lage-von-ebenen", "Abi_Relevant"],
  );
  assert.deepEqual(deriveTags(undefined, mathe, [], cfg.kategorien), ["schule/mathe"]);
});

test("Template-Platzhalter", () => {
  const out = renderTemplate(DEFAULT_TAGESNOTE_TEMPLATE, {
    fach: "Mathe", datum: "2026-10-15", halbjahr: "12-1", themen: ["Geraden"], base: "Tagesnotes.base",
  });
  assert.match(out, /fach: "\[\[Mathe\]\]"/);
  assert.match(out, /themen:\n  - "\[\[Geraden\]\]"\n/);
  assert.match(out, /# Mathe, 2026-10-15/);
  const leer = renderTemplate(DEFAULT_TAGESNOTE_TEMPLATE, {
    fach: "Mathe", datum: "2026-10-15", halbjahr: "", themen: [], base: "",
  });
  assert.match(leer, /themen:\n  \[\]\n/);
});

test("attachmentTarget: nur Anhänge aus Tagesnote-Ordnern, Ziel <Kat>/attachments/<Zeitraum>", async () => {
  const { attachmentTarget, freePath } = await import("../src/paths.ts");
  const { pathConfig, DEFAULT_SETTINGS } = await import("../src/defaults.ts");
  const cfg = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche[0]);
  const mathe = cfg.kategorien.find((k) => k.name === "Mathe")!;
  assert.equal(attachmentTarget("01-Schule/Mathe/13-1/Geraden/attachments/a.png", mathe, "13-1", cfg), "01-Schule/Mathe/attachments/13-1/a.png");
  assert.equal(attachmentTarget("01-Schule/Mathe/12-2/Geraden/attachments/a.png", mathe, "13-1", cfg), "01-Schule/Mathe/attachments/13-1/a.png");
  assert.equal(attachmentTarget("01-Schule/Mathe/attachments/13-1/a.png", mathe, "13-1", cfg), null);
  assert.equal(attachmentTarget("01-Schule/Mathe/_Themen/attachments/a.png", mathe, "13-1", cfg), null);
  assert.equal(attachmentTarget("01-Schule/Physik/13-1/X/attachments/a.png", mathe, "13-1", cfg), null);
  assert.equal(attachmentTarget("01-Schule/Mathe/13-1/Geraden/a.png", mathe, "13-1", cfg), null);
  assert.equal(attachmentTarget("01-Schule/Mathe/13-1/Geraden/attachments/x.md", mathe, "13-1", cfg), null);
  assert.equal(attachmentTarget("01-Schule/Mathe/13-1/Geraden/attachments/a.png", mathe, null, cfg), "01-Schule/Mathe/attachments/_Ohne Halbjahr/a.png");
  const taken = new Set(["a.png", "a 1.png"]);
  assert.equal(freePath("a.png", (p) => taken.has(p)), "a 2.png");
  assert.equal(freePath("Makefile", () => false), "Makefile");
});
