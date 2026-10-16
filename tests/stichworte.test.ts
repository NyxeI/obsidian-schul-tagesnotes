import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TAG_ZUORDNUNG as map, extractUnterthemen, normalizeTag, rewriteInlineTags, stichwortSlug } from "../src/stichworte.ts";

const dub = new Set(["mathe", "physik", "deutsch", "wsem", "bonsai", "geographie"]);

test("Slugs", () => {
  assert.equal(stichwortSlug("NikolausKopernikus"), "nikolaus-kopernikus");
  assert.equal(stichwortSlug("LoRa"), "lora");
  assert.equal(stichwortSlug("DieRäuber"), "die-raeuber");
  assert.equal(stichwortSlug("parallele_ausfuehrung"), "parallele-ausfuehrung");
  assert.equal(stichwortSlug("MAC-Adressen"), "mac-adressen");
  assert.equal(stichwortSlug("Chiralität"), "chiralitaet");
});

test("Zuordnung: Dubletten fallen weg, Markierungen, Personen, Stichworte, Hierarchie bleibt", () => {
  assert.equal(normalizeTag("Mathe", map, dub), null);
  assert.equal(normalizeTag("#Schule", map, dub), null);
  assert.equal(normalizeTag("Abi_Relevant", map, dub), "markierung/abi-relevant");
  assert.equal(normalizeTag("abi_relevant", map, dub), "markierung/abi-relevant");
  assert.equal(normalizeTag("Sideinfos", map, dub), "markierung/sideinfo");
  assert.equal(normalizeTag("TrevorNoah", map, dub), "person/trevor-noah");
  assert.equal(normalizeTag("Astro", map, dub), "stichwort/astronomie");
  assert.equal(normalizeTag("Astronomie", map, dub), "stichwort/astronomie");
  assert.equal(normalizeTag("Medizinethik", map, dub), "stichwort/medizinethik");
  assert.equal(normalizeTag("schule/mathe", map, dub), "schule/mathe");
  assert.equal(normalizeTag("stichwort/x", map, dub), "stichwort/x");
});

test("Text umschreiben: Tag-Zeile, Fließtext, geschützte Stellen", () => {
  const c = "---\ntags: [x]\n---\n16-09-2026\n#schule #mathe #geometrie \n\nText mit #Abi_Relevant und [[#Abschnitt]] und `#code` und https://x.de/#anker\n# Überschrift\n#Mathe #Physik\nWeiter";
  const r = rewriteInlineTags(c, map, dub);
  assert.equal(
    r.content,
    "---\ntags: [x]\n---\n16-09-2026\n#stichwort/geometrie\n\nText mit #markierung/abi-relevant und [[#Abschnitt]] und `#code` und https://x.de/#anker\n# Überschrift\nWeiter",
  );
  assert.deepEqual(r.tags.sort(), ["markierung/abi-relevant", "stichwort/geometrie"]);
  assert.equal(r.changed, 6);
  assert.equal(rewriteInlineTags(r.content, map, dub).changed, 0, "idempotent");
});

test("Unterthemen aus ## und ###", () => {
  const c = "---\na: 1\n---\n# Geraden\n## 3.3 Lagebeziehungen von Geraden\n### Punktprobe:\n## Zusammenfassung\n## **Wichtig**\n## [[Vektor|Vektoren]] im Raum\n### Aufgabe 3\n## Lagebeziehungen von Geraden\n```\n## im Code\n```\n## :LiCompass: Navigation\n## Tagesnotes";
  assert.deepEqual(extractUnterthemen(c), ["Lagebeziehungen von Geraden", "Punktprobe", "Vektoren im Raum"]);
  assert.deepEqual(extractUnterthemen("## Woyzeck\n## Szene", ["Woyzeck"]), ["Szene"]);
});

test("Tagesübersicht: Base mit Daily-Note-Format, Einbettung nur einmal", async () => {
  const { tagBase, addTagBaseEmbed } = await import("../src/templates.ts");
  assert.match(tagBase("DD-MM-YYYY"), /date\(datum\)\.format\("DD-MM-YYYY"\) == this\.file\.name/);
  const once = addTagBaseEmbed("---\ntags: []\n---\n", "Tag.base");
  assert.equal(once, "---\ntags: []\n---\n\n## Heute\n![[Tag.base]]\n");
  assert.equal(addTagBaseEmbed(once, "Tag.base"), once);
});
