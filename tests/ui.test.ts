import { test } from "node:test";
import assert from "node:assert/strict";
import { planBereichHub, repairBrokenLinks } from "../src/bereichhub.ts";
import { bereichBase, slimBase } from "../src/templates.ts";
import { pluginBases } from "../src/bases.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/defaults.ts";

test("Kaputte Links „Name]]“ werden repariert, intakte bleiben", () => {
  const r = repairBrokenLinks("\nChemie]] \n- Mathe]]\n[[Deutsch]]\nText mit [[Link]]\n![[bild.png|300]]\n");
  assert.equal(r.content, "\n[[Chemie]] \n- [[Mathe]]\n[[Deutsch]]\nText mit [[Link]]\n![[bild.png|300]]\n");
  assert.equal(r.repariert, 2);
});

test("Bereichs-Hub: Karten oben einbetten, nur einmal", () => {
  const p = planBereichHub("\nChemie]]\nPhysik]]\n", "Bereich.base", "Schule");
  assert.equal(p.content, "## Übersicht\n![[Bereich.base#Schule]]\n\n[[Chemie]]\n[[Physik]]\n");
  assert.equal(planBereichHub(p.content!, "Bereich.base", "Schule").content, null);
  const mitFm = planBereichHub("---\nbanner: x\n---\nText\n", "Bereich.base", "Projekte");
  assert.equal(mitFm.content, "---\nbanner: x\n---\n## Übersicht\n![[Bereich.base#Projekte]]\n\nText\n");
});

test("Bereich.base: eine Karten-Ansicht pro Bereich mit Banner-Formel", () => {
  const b = bereichBase([{ name: "Schule", property: "fach", root: "01-Schule" }, { name: "Projekte", property: "projekt", root: "04-Projekte" }]);
  assert.match(b, /type: cards\n    name: Schule\n[\s\S]*typ == "fach"\n        - file\.inFolder\("01-Schule"\)/);
  assert.match(b, /name: Projekte\n[\s\S]*typ == "projekt"/);
  assert.match(b, /image: formula\.cover/);
});

test("slimBase: keine Tag-/Datum-/Halbjahr-Spalten, Themen-Hubs als Liste", () => {
  const s = slimBase("  - type: table\n    name: Themen-Hubs\n    order:\n      - file.name\n      - file.tags\n      - datum\n    sort:\n      - property: datum\n");
  assert.equal(s, "  - type: list\n    name: Themen-Hubs\n    order:\n      - file.name\n    sort:\n      - property: datum\n");
});

test("pluginBases: alle Bases, schlank, mit Zusatz-Ansichten", () => {
  const m = pluginBases(DEFAULT_SETTINGS, "DD-MM-YYYY");
  assert.deepEqual([...m.keys()].sort(), [
    "01-Schule/_Bases/Bereich.base",
    "01-Schule/_Bases/Fach.base",
    "04-Projekte/_Bases/Projekt.base",
    "05-Journal/_Bases/Journal.base",
    "05-Journal/_Bases/Tag.base",
    "Inbox.base",
  ]);
  const fach = m.get("01-Schule/_Bases/Fach.base")!;
  for (const v of ["Nach Datum", "Nach Thema", "Nach Kapitel", "Unterthemen", "Abi-relevant", "Datum prüfen", "Begriffe"]) assert.match(fach, new RegExp(`name: ${v}\\n`));
  assert.doesNotMatch(fach, /^ {6}- file\.tags$/m);
  assert.match(m.get("05-Journal/_Bases/Tag.base")!, /DD-MM-YYYY/);
});

test("mergeSettings ergänzt neue Bereichsfelder aus den Standardwerten", () => {
  const alt = structuredClone(DEFAULT_SETTINGS.bereiche).map((b) => ({ ...b, hubPath: undefined }));
  for (const b of alt) delete (b as any).hubPath;
  const s = mergeSettings({ bereiche: alt });
  assert.equal(s.bereiche[0].hubPath, "01-Schule/Schule.md");
  assert.equal(s.anzeige.kompakt, true);
  assert.equal(mergeSettings({ kompakt: false }).anzeige.kompakt, false, "alter Schalter wird übernommen");
});

test("Dialog-Daten: Themen mit Anzahl/letztem Datum, Fächer nach letzter Benutzung", async () => {
  const { collectThemenInfo, kategorieStats, sortByRecent, kurzDatum } = await import("../src/themen.ts");
  const { pathConfig } = await import("../src/defaults.ts");
  const cfg = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche[0]);
  const mathe = cfg.kategorien.find((k) => k.name === "Mathe")!;
  const tn = (datum: string, fach: string, themen: string[]) => ({ path: `x/${datum} ${fach}.md`, basename: `${datum} ${fach}`, mtime: 0, fm: { typ: "tagesnote", fach: `[[${fach}]]`, datum, themen: themen.map((t) => `[[${t}]]`) } });
  const notes = [
    tn("2026-10-01", "Mathe", ["Geraden"]),
    tn("2026-10-15", "Mathe", ["Ebenen", "Geraden"]),
    tn("2026-10-10", "Physik", ["Optik"]),
    { path: "01-Schule/Mathe/_Themen/Vektoren.md", basename: "Vektoren", mtime: 5, fm: { typ: "thema", fach: "[[Mathe]]" } },
  ];
  assert.deepEqual(collectThemenInfo(notes, mathe, cfg), [
    { name: "Ebenen", zuletzt: "2026-10-15", anzahl: 1 },
    { name: "Geraden", zuletzt: "2026-10-15", anzahl: 2 },
    { name: "Vektoren", zuletzt: "", anzahl: 0 },
  ]);
  const stats = kategorieStats(notes, cfg);
  assert.deepEqual(stats.get("Mathe"), { zuletzt: "2026-10-15", anzahl: 2 });
  const order = sortByRecent(["Chemie", "Mathe", "Physik", "Deutsch"], (n) => stats.get(n)?.zuletzt ?? "");
  assert.deepEqual(order, ["Mathe", "Physik", "Chemie", "Deutsch"]);
  assert.equal(kurzDatum("2026-10-15", "2026-10-16"), "15.10.");
  assert.equal(kurzDatum("2025-03-02", "2026-10-16"), "02.03.25");
  assert.equal(kurzDatum("", "2026-10-16"), "");
});

test("Ansicht: Schalter-Klassen, Art der Note, Nachbarn im Thema, Hub-Zahlen, Notes am Tag", async () => {
  const { bodyClasses, noteArt, shiftDate, nachbarnImThema, hubStats, notesAmTag, DEFAULT_ANZEIGE } = await import("../src/ansicht.ts");
  const { pathConfig } = await import("../src/defaults.ts");
  assert.deepEqual(bodyClasses(DEFAULT_ANZEIGE), { "schul-kompakt": true, "schul-tn-aus": true, "schul-props-aus": false, "schul-breit": false });
  assert.equal(noteArt({ typ: "fach" }, ["fach", "projekt"]), "hub");
  assert.equal(noteArt({ typ: "tagesnote" }, ["fach"]), "note");
  assert.equal(noteArt({ typ: "journal" }, ["fach"]), null);
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  const cfg = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche[0]);
  const n = (name: string, datum: string, thema: string, extra: Record<string, unknown> = {}) => ({
    path: `01-Schule/Mathe/x/${name}.md`, basename: name, mtime: 0, fm: { typ: "tagesnote", fach: "[[Mathe]]", datum, thema, ...extra },
  });
  const notes = [
    n("2026-03-02 Mathe (2)", "2026-03-02", "Geraden"),
    n("2026-03-02 Mathe", "2026-03-02", "Geraden", { datum_geschaetzt: true }),
    n("2026-03-01 Mathe", "2026-03-01", "Ebenen"),
    n("2026-03-05 Mathe", "2026-03-05", "Geraden"),
  ];
  const nb = nachbarnImThema(notes, cfg, notes[0]);
  assert.deepEqual(nb, { prev: "01-Schule/Mathe/x/2026-03-02 Mathe.md", next: "01-Schule/Mathe/x/2026-03-05 Mathe.md", pos: 2, von: 3 });
  const mathe = cfg.kategorien.find((k) => k.name === "Mathe")!;
  assert.deepEqual(hubStats(notes, cfg, mathe), { notes: 4, themen: 2, geschaetzt: 1, erste: "2026-03-01", letzte: "2026-03-05" });
  assert.deepEqual(notesAmTag(notes, cfg, mathe, "2026-03-02").map((x) => x.basename), ["2026-03-02 Mathe", "2026-03-02 Mathe (2)"]);
});

test("Spalten: Breiten passen in die Notizbreite, Listen bekommen mehr Platz", async () => {
  const { spaltenBreiten, setzeSpalten, setzeTabellen, spaltenId } = await import("../src/spalten.ts");
  assert.equal(spaltenId("thema"), "note.thema");
  assert.equal(spaltenId("file.tags"), "file.tags");
  const b = spaltenBreiten(["file.name", "abschnitt", "unterthemen"], 690);
  assert.equal(b["file.name"], 175);
  assert.ok(b["note.unterthemen"] > b["note.abschnitt"]);
  assert.ok(Object.values(b).reduce((x, y) => x + y, 0) <= 690);
  const base = { views: [{ type: "table", name: "Nach Thema", order: ["file.name", "abschnitt"] }, { type: "list", name: "L", order: ["file.name"] }] };
  assert.equal(setzeSpalten(base, "Nach Thema", ["thema", "datum"], 690), true);
  assert.deepEqual(base.views[0].order, ["file.name", "thema", "datum"]);
  assert.equal((base.views[0] as any).columnSize["note.datum"], 125);
  assert.equal(setzeSpalten(base, "Fehlt", [], 690), false);
  setzeTabellen(base, "tall", 1100);
  assert.equal((base.views[0] as any).rowHeight, "tall");
  assert.equal((base.views[1] as any).rowHeight, undefined, "Listen bleiben unverändert");
});

test("Banner: eigenes, sonst aus der früheren Note, sonst vom Fach-Hub", async () => {
  const { bannerFuer, planBanner } = await import("../src/banner.ts");
  const { pathConfig } = await import("../src/defaults.ts");
  assert.equal(bannerFuer("eigen", "q", "h", true), "eigen");
  assert.equal(bannerFuer(undefined, "q", "h", true), "q");
  assert.equal(bannerFuer("", null, "h", true), "h");
  assert.equal(bannerFuer(null, null, "h", false), null);
  const cfg = pathConfig(DEFAULT_SETTINGS, DEFAULT_SETTINGS.bereiche[0]);
  const n = (path: string, fm: Record<string, unknown>) => ({ path, basename: path, mtime: 0, fm: { typ: "tagesnote", fach: "[[Mathe]]", ...fm } });
  const plan = planBanner(
    [n("a1", { quelle: "Q.md", banner: "[[b.png]]" }), n("a2", { quelle: "Q.md" }), n("b1", { quelle: "R.md" }), n("c1", { banner: "x" })],
    cfg,
    (f) => (f === "Mathe" ? "[[mathe.png]]" : null),
    true,
  );
  assert.deepEqual(plan, [
    { path: "a2", banner: "[[b.png]]", herkunft: "quelle" },
    { path: "b1", banner: "[[mathe.png]]", herkunft: "hub" },
  ]);
});

test("Farben: Schlüssel, Standard und eigene Themenfarbe, Normalisierung", async () => {
  const { themaFarbe, normalisiereFarbe, farbSchluessel, knopfSichtbar, DEFAULT_ANZEIGE } = await import("../src/ansicht.ts");
  const a = { ...DEFAULT_ANZEIGE, themaFarben: { [farbSchluessel("Mathe", "Vektoren")]: "#ff0000" } };
  assert.equal(themaFarbe(a, "Mathe", "Vektoren"), "#ff0000");
  assert.equal(themaFarbe(a, "Mathe", "Ebenen"), null, "ohne Standardfarbe: Akzentfarbe des Themes");
  assert.equal(themaFarbe({ ...a, gruppenFarbe: "#00ff00" }, "Mathe", "Ebenen"), "#00ff00");
  assert.equal(normalisiereFarbe("#AbC"), "#aabbcc");
  assert.equal(normalisiereFarbe("rot"), null);
  assert.equal(knopfSichtbar(a, "neu"), true);
  assert.equal(knopfSichtbar({ ...a, leisteKnoepfe: { neu: false } }, "neu"), false);
});
