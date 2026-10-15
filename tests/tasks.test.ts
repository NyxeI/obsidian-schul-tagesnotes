import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, schule } from "../src/defaults.ts";
import { dedentChildren, fachFromText, findTasks, linkLine, renderTaskNote, setChecked, taskTitle } from "../src/tasks.ts";

const notizblock = `# ToDo
- [x] CSS Snippet für farbige Obsidian Tabellen
\t- [x] Mit Snippet um Tabellen nicht den großen Abstand haben zu lassen
- [ ] #Info Lernen
- [x] #mathe HA machen
- [ ] Tablet zurücksetzen [[Tablet zurücksetzen]]
- [ ] #wsem weiter schreiben
\`\`\`
- [ ] im Code
\`\`\`
  - [ ] eingerückt`;

test("Checkboxen finden: oberste Ebene, Unterpunkte, vorhandene Links", () => {
  const tasks = findTasks(notizblock, (n) => n === "Tablet zurücksetzen");
  assert.deepEqual(tasks.map((t) => [t.index, t.checked, t.linked]), [
    [1, true, null],
    [3, false, null],
    [4, true, null],
    [5, false, "Tablet zurücksetzen"],
    [6, false, null],
  ]);
  assert.deepEqual(tasks[0].children, ["\t- [x] Mit Snippet um Tabellen nicht den großen Abstand haben zu lassen"]);
  assert.equal(findTasks("---\ntags: [a]\n---\n- [ ] x", () => false)[0].index, 3);
});

test("Titel: Tags werden zu Wörtern, Links und Termine fallen weg", () => {
  const k = schule(DEFAULT_SETTINGS).kategorien;
  assert.equal(taskTitle("#Info Lernen", k), "Info Lernen");
  assert.equal(taskTitle("#wsem weiter schreiben", k), "W-Seminar weiter schreiben");
  assert.equal(taskTitle("#mathe HA machen", k), "Mathe HA machen");
  assert.equal(taskTitle("für Ex lernen @{2026-01-26}", k), "für Ex lernen");
  assert.equal(taskTitle("Applett verbessern (@2025-11-04 13:00)"), "Applett verbessern");
  assert.equal(taskTitle("Tablet zurücksetzen [[Tablet zurücksetzen]]"), "Tablet zurücksetzen");
  assert.equal(taskTitle("Was ist: X/Y?"), "Was ist X Y");
  assert.equal(taskTitle("[[x]]"), "Aufgabe");
});

test("Fach aus Tags", () => {
  const k = schule(DEFAULT_SETTINGS).kategorien;
  assert.equal(fachFromText("#mathe HA machen", k)?.name, "Mathe");
  assert.equal(fachFromText("#wsem weiter schreiben", k)?.name, "W-Seminar");
  assert.equal(fachFromText("#Info Lernen", k), null);
});

test("TaskNote im TaskNotes-Format, Zeilen bearbeiten", () => {
  const out = renderTaskNote({ title: "HA machen", done: false, created: "2026-10-15T09:09:00", quelle: "Notizblock", projects: ["Mathe"], body: "", tag: "task" });
  assert.equal(out, '---\ntitle: "HA machen"\nstatus: open\npriority: normal\ndateCreated: 2026-10-15T09:09:00\ndateModified: 2026-10-15T09:09:00\ntags:\n  - task\nprojects:\n  - "[[Mathe]]"\nquelle: "[[Notizblock]]"\n---\n');
  assert.match(renderTaskNote({ title: "X", done: true, created: "2026-10-15T09:09:00", quelle: "Q", projects: [], body: "", tag: "task" }), /status: done\n[\s\S]*completedDate: 2026-10-15/);
  assert.equal(linkLine("- [ ] #mathe HA machen ", "HA machen"), "- [ ] #mathe HA machen [[HA machen]]");
  assert.equal(setChecked("- [ ] a", true), "- [x] a");
  assert.equal(setChecked("- [X] a", false), "- [ ] a");
  assert.equal(dedentChildren(["\t- a", "    - b"]), "- a\n- b");
});
