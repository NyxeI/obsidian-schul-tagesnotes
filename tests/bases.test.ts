import { test } from "node:test";
import assert from "node:assert/strict";
import { gleicheBase, kategorieBasePfade, mitAnzeige, pluginBases, veralteteBases } from "../src/bases.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/defaults.ts";
import { setzeSpalten, setzeTabellen, tabellenBreite, type BaseDatei } from "../src/spalten.ts";
import { parseYaml, stringifyYaml } from "./support/yaml.ts";

const yaml = { parse: parseYaml, stringify: stringifyYaml };
const s = mergeSettings(DEFAULT_SETTINGS, {});
const soll = pluginBases(s);
const kategorie = kategorieBasePfade(s);
const fach = [...kategorie][0];

/** Wie `bearbeiteBase` im Panel: Kopfkommentare behalten, Rumpf neu schreiben. */
function panel(text: string, aendern: (b: BaseDatei) => void): string {
  const kopf = (/^(?:#[^\n]*\n)+/.exec(text) ?? [""])[0];
  const b = parseYaml(text.slice(kopf.length)) as BaseDatei;
  aendern(b);
  return kopf + stringifyYaml(b);
}

/** Ist-Stand: alle Bases wie vom Plugin geschrieben, Fach.base ersetzt. */
function ist(fachInhalt: string): Map<string, string | null> {
  const m = new Map<string, string | null>([...soll].map(([p, t]) => [p, t]));
  m.set(fach, fachInhalt);
  return m;
}

test("Alle Plugin-Bases lassen sich parsen; frisch geschrieben ist nichts veraltet", () => {
  for (const [p, t] of soll) assert.ok(parseYaml(t) && typeof parseYaml(t) === "object", p);
  assert.ok(kategorie.has("01-Schule/_Bases/Fach.base"));
  assert.equal(veralteteBases(soll, new Map(soll), kategorie, s.anzeige, yaml).size, 0);
});

test("Fehlende Base gilt als veraltet", () => {
  const m = ist(soll.get(fach)!);
  m.set(fach, null);
  const stale = veralteteBases(soll, m, kategorie, s.anzeige, yaml);
  assert.deepEqual([...stale.keys()], [fach]);
});

test("Spalten aus dem Panel: Base gilt nicht als veraltet", () => {
  const geaendert = panel(soll.get(fach)!, (b) => void setzeSpalten(b, "Nach Datum", ["kapitel", "thema"], tabellenBreite(false)));
  assert.equal(veralteteBases(soll, ist(geaendert), kategorie, s.anzeige, yaml).size, 0);
});

test("Zeilenhöhe/volle Breite aus dem Panel: Base gilt nicht als veraltet", () => {
  const anzeige = { ...s.anzeige, zeilenhoehe: "tall" as never, volleBreite: true };
  const geaendert = panel(soll.get(fach)!, (b) => setzeTabellen(b, anzeige.zeilenhoehe, tabellenBreite(true)));
  assert.equal(veralteteBases(soll, ist(geaendert), kategorie, anzeige, yaml).size, 0);
  // auch wenn die Einstellungen später wieder zurückgestellt wurden, die Datei aber nicht
  assert.equal(veralteteBases(soll, ist(geaendert), kategorie, s.anzeige, yaml).size, 0);
});

test("Fehlende Ansicht: veraltet, Nutzer-Spalten der übrigen Ansichten bleiben", () => {
  const geaendert = panel(soll.get(fach)!, (b) => {
    setzeSpalten(b, "Nach Thema", ["kapitel"], tabellenBreite(false));
    b.views = b.views!.filter((v) => v.name !== "Unterthemen");
  });
  const stale = veralteteBases(soll, ist(geaendert), kategorie, s.anzeige, yaml);
  assert.deepEqual([...stale.keys()], [fach]);
  const neu = stale.get(fach)!;
  assert.match(neu, /^# Einziger Hub der Kategorie/);
  const b = parseYaml(neu) as BaseDatei;
  assert.ok(b.views!.some((v) => v.name === "Unterthemen"));
  const thema = b.views!.find((v) => v.name === "Nach Thema")!;
  assert.deepEqual(thema.order, ["file.name", "kapitel"]);
  assert.deepEqual(Object.keys(thema.columnSize!), ["file.name", "note.kapitel"]);
  // nach dem Schreiben ist alles auf Stand
  assert.equal(veralteteBases(soll, ist(neu), kategorie, s.anzeige, yaml).size, 0);
});

test("Geänderter Filter: veraltet, Filter kommt vom Plugin, Spalten vom Nutzer", () => {
  const geaendert = panel(soll.get(fach)!, (b) => {
    setzeSpalten(b, "Nach Datum", ["abschnitt"], tabellenBreite(false));
    setzeTabellen(b, "short", tabellenBreite(false));
    b.views![0].filters = { and: ['typ == "alt"'] };
  });
  const neu = veralteteBases(soll, ist(geaendert), kategorie, s.anzeige, yaml).get(fach)!;
  const v = (parseYaml(neu) as BaseDatei).views![0];
  const plugin = (parseYaml(soll.get(fach)!) as BaseDatei).views![0];
  assert.deepEqual(v.filters, plugin.filters);
  assert.deepEqual(v.order, ["file.name", "abschnitt"]);
  assert.equal(v.rowHeight, "short");
});

test("mitAnzeige: ohne Abweichung bleibt der Soll-Text unverändert (inkl. Kommentare)", () => {
  const t = "# Kopf\nviews:\n  - type: cards\n    name: Karten\n";
  assert.equal(mitAnzeige(t, null, s.anzeige, yaml), t);
  assert.ok(gleicheBase(t, "views:\n  - name: Karten\n    type: cards\n", yaml));
});

test("Andere Bases: Textunterschied ohne inhaltliche Abweichung ist nicht veraltet, echte Abweichung schon", () => {
  const p = s.journal.basePath;
  const m = new Map(soll as Map<string, string | null>);
  m.set(p, "# anderer Kommentar\n" + stringifyYaml(parseYaml(soll.get(p)!)));
  assert.equal(veralteteBases(soll, m, kategorie, s.anzeige, yaml).size, 0);
  m.set(p, soll.get(p)!.replace("views:", "views_alt:"));
  assert.deepEqual([...veralteteBases(soll, m, kategorie, s.anzeige, yaml).keys()], [p]);
});
