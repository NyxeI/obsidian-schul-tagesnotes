import { test } from "node:test";
import assert from "node:assert/strict";
import { isLinkList, kapitelView, planHubLinks } from "../src/hublinks.ts";
import { addViews } from "../src/templates.ts";

const HUB = `---
typ: fach
---

## Stoff
- [[Die Räuber]]
	- [[Goethe Ganymed|Ganymed]]
[Wichtig](Motive.md)
---
[[Woyzeck]] 

## Übersicht
![[Fach.base]]
`;

test("Linkliste wird eingeklappt, Themen-Ansicht kommt darüber, Base bleibt", () => {
  const p = planHubLinks(HUB, "Fach.base");
  assert.deepEqual(p.links, ["Die Räuber", "Goethe Ganymed", "Woyzeck"]);
  assert.equal(
    p.content,
    `---
typ: fach
---
## Themen
![[Fach.base#Themen nach Kapitel]]

> [!abstract]- Alte Linkliste (vor der Umstellung)
> ## Stoff
> - [[Die Räuber]]
> 	- [[Goethe Ganymed|Ganymed]]
> [Wichtig](Motive.md)
> ---
> [[Woyzeck]] 

## Übersicht
![[Fach.base]]
`,
  );
  // zweiter Lauf: nichts mehr zu tun
  assert.equal(planHubLinks(p.content!, "Fach.base").content, null);
});

test("Hubs mit eigenem Inhalt oder ohne Base bleiben unverändert", () => {
  const inhalt = "---\ntyp: projekt\n---\n# Wissen\nText über Bonsai.\nNoch mehr Text.\n![[bild.png]]\n# Projekte\n[[Pinie]]\n\n## Übersicht\n![[Projekt.base]]\n";
  assert.equal(planHubLinks(inhalt, "Projekt.base").content, null);
  assert.equal(planHubLinks("---\ntyp: fach\n---\n[[A]]\n[[B]]\n", "Fach.base").grund, "keine Einbettung ![[Fach.base]]");
  assert.equal(isLinkList(["## X", "---", ""]), false);
});

test("Kapitel-Ansicht wird nur einmal angehängt", () => {
  const base = "views:\n  - type: table\n    name: A\n";
  const once = addViews(base, [kapitelView("fach")]);
  assert.match(once, /name: Themen nach Kapitel\n[\s\S]*property: kapitel/);
  assert.equal(addViews(once, [kapitelView("fach")]), once);
});
