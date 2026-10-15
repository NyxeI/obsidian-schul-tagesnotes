import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeApp, TFile, notices } from "./support/fake-obsidian.ts";
import { Sorter } from "../src/sort.ts";
import { DEFAULT_SETTINGS } from "../src/defaults.ts";

function setup() {
  const app = new FakeApp();
  const sorter = new Sorter(app as any, () => DEFAULT_SETTINGS);
  return { app, sorter };
}

test("Tagesnote wird nach Fach/Halbjahr/Thema verschoben, Tags + Halbjahr gesetzt, Hub angelegt", async () => {
  const { app, sorter } = setup();
  const f = app.addNote("Neue Notiz.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Geraden]]"], tags: ["Abi_Relevant"] });
  assert.equal(await sorter.sortFile(f as any), "moved");
  assert.equal(f.path, "01-Schule/Mathe/13-1/Geraden/2026-10-15 Mathe.md");
  assert.deepEqual(f.frontmatter!.tags, ["schule/mathe", "mathe/geraden", "Abi_Relevant"]);
  assert.equal(f.frontmatter!.halbjahr, "13-1");
  const hub = app.vault.getAbstractFileByPath("01-Schule/Mathe/_Themen/Geraden.md") as TFile;
  assert.ok(hub, "Hub fehlt");
  assert.equal(hub.frontmatter!.typ, "thema");
  assert.deepEqual(hub.frontmatter!.tags, ["schule/mathe", "mathe/geraden"]);
  assert.match(hub.body, /!\[\[Thema\.base\]\]/);
  // Zweiter Lauf ändert nichts mehr
  assert.equal(await sorter.sortFile(f as any), "unchanged");
});

test("Themenwechsel verschiebt in den neuen Themenordner und tauscht den Thema-Tag", async () => {
  const { app, sorter } = setup();
  const f = app.addNote("x.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Geraden]]"] });
  await sorter.sortFile(f as any);
  f.frontmatter!.themen = ["[[Ebenen]]", "[[Geraden]]"];
  assert.equal(await sorter.sortFile(f as any), "moved");
  assert.equal(f.path, "01-Schule/Mathe/13-1/Ebenen/2026-10-15 Mathe.md");
  assert.deepEqual(f.frontmatter!.tags, ["schule/mathe", "mathe/ebenen", "mathe/geraden"]);
});

test("Vorhandener Hub an anderer Stelle wird wiederverwendet, nicht doppelt angelegt", async () => {
  const { app, sorter } = setup();
  app.addNote("01-Schule/Mathe/Alt/Geraden.md", { typ: "thema", fach: "[[Mathe]]" });
  const f = app.addNote("x.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Geraden]]"] });
  await sorter.sortFile(f as any);
  assert.equal(app.vault.getAbstractFileByPath("01-Schule/Mathe/_Themen/Geraden.md"), null);
});

test("Konflikt: Zieldatei existiert schon → nicht verschieben", async () => {
  const { app, sorter } = setup();
  app.addNote("01-Schule/Mathe/13-1/_Allgemein/2026-10-15 Mathe.md", { typ: "tagesnote" });
  const f = app.addNote("y.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15", themen: [] });
  assert.equal(await sorter.sortFile(f as any), "conflict");
  assert.equal(f.path, "y.md");
  assert.ok(notices.some((n) => n.includes("existiert schon")));
});

test("Andere Notes und unvollständige Tagesnotes bleiben unberührt", async () => {
  const { app, sorter } = setup();
  const a = app.addNote("a.md", null);
  const b = app.addNote("b.md", { typ: "tagesnote", fach: "[[Latein]]", datum: "2026-10-15" });
  const c = app.addNote("c.md", { tags: ["x"] });
  for (const f of [a, b, c]) assert.equal(await sorter.sortFile(f as any), "skipped");
  assert.deepEqual(app.renames, []);
});

test("Themen-Hub: Tags werden aus Fach und eigenem Namen abgeleitet, Hub bleibt liegen", async () => {
  const { app, sorter } = setup();
  const hub = app.addNote("01-Schule/Physik/_Themen/Strahlenphysik.md", { typ: "thema", fach: "[[Physik]]", tags: ["#Physik", "SideInfos"] });
  assert.equal(await sorter.sortFile(hub as any), "updated");
  assert.deepEqual(hub.frontmatter!.tags, ["schule/physik", "physik/strahlenphysik", "Physik", "SideInfos"]);
  assert.equal(hub.path, "01-Schule/Physik/_Themen/Strahlenphysik.md");
});

test("Leere alte Themen-/Halbjahrordner werden entfernt, Fachordner bleibt", async () => {
  const { app, sorter } = setup();
  for (const d of ["01-Schule", "01-Schule/Mathe", "01-Schule/Mathe/13-1", "01-Schule/Mathe/13-1/Geraden", "01-Schule/Mathe/_Ohne Halbjahr", "01-Schule/Mathe/_Ohne Halbjahr/Alt"])
    await app.vault.createFolder(d);
  const f = app.addNote("01-Schule/Mathe/_Ohne Halbjahr/Alt/x.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Geraden]]"] });
  app.addNote("01-Schule/Mathe/_Themen/Geraden.md", { typ: "thema", fach: "[[Mathe]]" });
  assert.equal(await sorter.sortFile(f as any), "moved");
  assert.deepEqual(app.trashed, ["01-Schule/Mathe/_Ohne Halbjahr/Alt", "01-Schule/Mathe/_Ohne Halbjahr"]);
  assert.ok(app.vault.getAbstractFileByPath("01-Schule/Mathe"));
});

test("Unterthemen werden aus den Überschriften nachgeführt", async () => {
  const { app, sorter } = setup();
  const f = app.addNote("x.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Geraden]]"] }, "# Mathe\n## Punktprobe\n## Zusammenfassung\n### Lagebeziehungen");
  await sorter.sortFile(f as any);
  assert.deepEqual(f.frontmatter!.unterthemen, ["Punktprobe", "Lagebeziehungen"]);
  f.body = "# Mathe";
  await sorter.sortFile(f as any);
  assert.equal(f.frontmatter!.unterthemen, undefined);
});
