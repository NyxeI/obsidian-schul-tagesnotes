import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarker, splitFrontmatter, splitSections, trimBlock } from "../src/migration/dates.ts";

test("Datumsmarken aus dem Vault werden erkannt", () => {
  assert.equal(parseMarker("16-09-2026"), "2026-09-16");
  assert.equal(parseMarker("8.5.2026"), "2026-05-08");
  assert.equal(parseMarker("## 07.10.25"), "2025-10-07");
  assert.equal(parseMarker("## 13.01.25 "), "2025-01-13");
  assert.equal(parseMarker("## Montag 12.03.2026"), "2026-03-12");
  assert.equal(parseMarker("### 12.03.26 - Mi"), "2026-03-12");
  assert.equal(parseMarker("**02-10-2026**"), "2026-10-02");
});

test("Keine Marke: Zusatztext, ungültige Daten, Fließtext", () => {
  assert.equal(parseMarker("## Dienstag, 2.12.25; 5. + 6. Stunde; Aula"), null);
  assert.equal(parseMarker("Am 02-10-2026 war Test"), null);
  assert.equal(parseMarker("31.02.2026"), null);
  assert.equal(parseMarker("1.2.3"), null);
  assert.equal(parseMarker("---"), null);
});

test("Note wird an Marken geteilt, Trennlinien fallen weg", () => {
  const body = "# Woyzeck\nEinleitung\n\n---\n02-10-2026\nStunde 1\n---\n09-10-2026\n\nStunde 2\n\n---\n";
  const r = splitSections(body);
  assert.equal(r.preamble, "# Woyzeck\nEinleitung");
  assert.deepEqual(
    r.sections.map((s) => [s.datum, s.body, s.line]),
    [
      ["2026-10-02", "Stunde 1", 5],
      ["2026-10-09", "Stunde 2", 8],
    ],
  );
});

test("Datum in der ersten Zeile: leerer Vorspann", () => {
  const r = splitSections("16-09-2026\n#schule #mathe\n\nInhalt");
  assert.equal(r.preamble, "");
  assert.equal(r.sections[0].body, "#schule #mathe\n\nInhalt");
});

test("Marken in Codeblöcken zählen nicht; ohne Marken bleibt alles im Vorspann", () => {
  const r = splitSections("```\n02-10-2026\n```\nText");
  assert.equal(r.sections.length, 0);
  assert.equal(r.preamble, "```\n02-10-2026\n```\nText");
});

test("Frontmatter abtrennen", () => {
  assert.deepEqual(splitFrontmatter("---\nbanner: x\n---\nBody"), { fm: "---\nbanner: x\n---\n", body: "Body" });
  assert.deepEqual(splitFrontmatter("16-09-2026\n---\nx"), { fm: "", body: "16-09-2026\n---\nx" });
  assert.equal(trimBlock("\n---\n\nA\n\n***\n"), "A");
});
