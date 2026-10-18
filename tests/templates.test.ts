import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TAGESNOTE_TEMPLATE, renderTemplate } from "../src/templates.ts";
import { pluginBases } from "../src/bases.ts";
import { DEFAULT_SETTINGS } from "../src/defaults.ts";

const vars = { fach: "Deutsch", datum: "2026-10-15", halbjahr: "Q1", base: "", property: "fach" };

test("renderTemplate: Thema mit Sonderzeichen bleibt gültiges YAML", () => {
  const unquotiert = DEFAULT_TAGESNOTE_TEMPLATE.replace('"{{thema}}"', "{{thema}}");
  for (const thema of ['Brave New World "Analyse"', "Pfad C:\\temp", "Teil: Eins", "Punkt #3", 'a\\"b: #c']) {
    for (const tpl of [DEFAULT_TAGESNOTE_TEMPLATE, unquotiert]) {
      const out = renderTemplate(tpl, { ...vars, themen: [thema] });
      const zeile = out.split("---")[1].split("\n").find((l) => l.startsWith("thema: "))!;
      // YAML-Doppelquote-String ist hier JSON-kompatibel
      assert.equal(JSON.parse(zeile.slice("thema: ".length)), thema);
    }
  }
});

test("renderTemplate: leeres Thema und Thema im Text", () => {
  const leer = renderTemplate(DEFAULT_TAGESNOTE_TEMPLATE, { ...vars, themen: [] });
  assert.ok(leer.includes('thema: ""\n'));
  const text = renderTemplate("---\nthema: x\n---\n# {{thema}}", { ...vars, themen: ['A "B"'] });
  assert.ok(text.endsWith('# A "B"'));
});

test("pluginBases: kein this-Filter im globalen filters-Block", () => {
  const bases = pluginBases(DEFAULT_SETTINGS);
  for (const [pfad, inhalt] of bases) {
    const global = inhalt.split(/^views:/m)[0];
    assert.ok(!global.includes("this."), pfad);
  }
  assert.ok(bases.get(DEFAULT_SETTINGS.tagBasePath)!.includes("this.file.name"));
});
