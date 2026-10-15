import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, schule } from "../src/defaults.ts";
import { buildJournalPlan, cleanDailyBody, journalTags, kategorieFor, parseJournalName, stripArchiveSection } from "../src/journal.ts";

const j = DEFAULT_SETTINGS.journal;

test("Dateinamen aus dem Vault", () => {
  assert.deepEqual(parseJournalName("202610050909 Notizblock"), { datum: "2026-10-05", uhrzeit: "09:09", titel: "Notizblock", id: "202610050909" });
  assert.deepEqual(parseJournalName("202510091104-Studium"), { datum: "2025-10-09", uhrzeit: "11:04", titel: "Studium", id: "202510091104" });
  assert.deepEqual(parseJournalName("202511061021"), { datum: "2025-11-06", uhrzeit: "10:21", titel: "", id: "202511061021" });
  assert.deepEqual(parseJournalName("23-04-2026"), { datum: "2026-04-23", uhrzeit: null, titel: "", id: null });
  assert.deepEqual(parseJournalName("16.02.2025 Tagesplan"), { datum: "2025-02-16", uhrzeit: null, titel: "Tagesplan", id: null });
  assert.deepEqual(parseJournalName("2026-10-15 0909 Notizblock"), { datum: "2026-10-15", uhrzeit: "09:09", titel: "Notizblock", id: null });
  assert.equal(parseJournalName("Untitled Task"), null);
  assert.equal(parseJournalName("202613010909 X"), null);
});

test("Kategorien", () => {
  assert.equal(kategorieFor("Notizblock", "", j), "Notizblock");
  assert.equal(kategorieFor("To-Do Today", "", j), "ToDo");
  assert.equal(kategorieFor("To do Today", "", j), "ToDo");
  assert.equal(kategorieFor("ToDo", "", j), "ToDo");
  assert.equal(kategorieFor("", "03-Archiv/Daily_Notes/23-04-2026.md", j), "Tagesplan");
  assert.equal(kategorieFor("Einführung Q13", "03-Archiv/Unique_Notes/x.md", j), "Notiz");
});

test("Tags, Daily-Reste, Archiv-Embed", () => {
  assert.deepEqual(journalTags(["#dailynote", "journal/alt", "Info"], "Tagesplan", "journal"), ["journal/tagesplan", "Info"]);
  assert.equal(cleanDailyBody("---\n# \n\n# Tests\nMathe"), "# Tests\nMathe");
  assert.equal(stripArchiveSection("# ToDo\n- [ ] a\n\n## Archiv\n![[Journal.base#Archiv]]\n", "Journal.base"), "# ToDo\n- [ ] a");
  assert.equal(stripArchiveSection("Text", "Journal.base"), "Text");
});

test("Journal-Plan: Ziele, Notizblock, Hubs, Übersprungenes", () => {
  const n = (path: string) => ({ path, content: "x" });
  const plan = buildJournalPlan(
    [
      n("03-Archiv/Unique_Notes/202605060802 Notizblock.md"),
      n("03-Archiv/Unique_Notes/202610050909 Notizblock.md"),
      n("03-Archiv/Unique_Notes/202511041123 ToDo.md"),
      n("03-Archiv/Unique_Notes/202511061021.md"),
      n("03-Archiv/Unique_Notes/Schule/Roboterbau/202504070726 Ideen für Fahren() Methode für WRO.md"),
      n("03-Archiv/Unique_Notes/Untitled Task.md"),
      n("03-Archiv/Daily_Notes/23-04-2026.md"),
      n("03-Archiv/Tagespläne/16.02.2025 Tagesplan.md"),
      n("03-Archiv/Tagespläne/Tagespläne.md"),
      n("03-Archiv/Stundenplan neu.md"),
    ],
    ["03-Archiv/Unique_Notes", "03-Archiv/Daily_Notes", "03-Archiv/Tagespläne"],
    j,
    schule(DEFAULT_SETTINGS).kategorien,
  );
  const to = Object.fromEntries(plan.ops.map((o) => [o.from.split("/").pop(), o.to]));
  assert.equal(to["202605060802 Notizblock.md"], "05-Journal/2026/2026-05/2026-05-06 0802 Notizblock.md");
  assert.equal(to["202511061021.md"], "05-Journal/2025/2025-11/2025-11-06 1021 Notiz.md");
  assert.equal(to["23-04-2026.md"], "05-Journal/2026/2026-04/2026-04-23 Tagesplan.md");
  assert.equal(to["16.02.2025 Tagesplan.md"], "05-Journal/2025/2025-02/2025-02-16 Tagesplan.md");
  const robo = plan.ops.find((o) => o.from.includes("Roboterbau"))!;
  assert.equal(robo.fach, "Roboterbau");
  assert.equal(robo.kategorie, "Notiz");
  assert.ok(plan.ops.find((o) => o.from.endsWith("23-04-2026.md"))!.daily);
  assert.deepEqual(plan.notizblock, {
    from: "03-Archiv/Unique_Notes/202610050909 Notizblock.md",
    archive: "05-Journal/2026/2026-10/2026-10-05 0909 Notizblock.md",
  });
  assert.deepEqual(plan.hubs.map((h) => h.path), ["05-Journal/ToDo.md", "05-Journal/Notiz.md", "05-Journal/Tagesplan.md"]);
  assert.match(plan.hubs[0].content, /typ: journal-kategorie\ntags:\n  - journal\/todo\n---\n# ToDo\n\n## Archiv\n!\[\[Journal\.base#Archiv\]\]/);
  assert.deepEqual(plan.skipped.map((s) => s.path), ["03-Archiv/Tagespläne/Tagespläne.md", "03-Archiv/Unique_Notes/Untitled Task.md"]);
  assert.ok(!plan.ops.some((o) => o.from.includes("Stundenplan")), "außerhalb der Quellen");
});
