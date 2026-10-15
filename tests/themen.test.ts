import { test } from "node:test";
import assert from "node:assert/strict";
import { collectThemen, type NoteInfo } from "../src/themen.ts";
import { DEFAULT_SETTINGS, schule } from "../src/defaults.ts";

const cfg = schule(DEFAULT_SETTINGS);

const mathe = cfg.kategorien.find((f) => f.name === "Mathe")!;
const n = (path: string, fm: Record<string, unknown> | null = null, mtime = 0): NoteInfo => ({
  path,
  basename: path.split("/").pop()!.replace(/\.md$/, ""),
  mtime,
  fm,
});

test("Alte Themen-Notes ohne Properties, Hubs und Tagesnote-Themen erscheinen; Rest nicht", () => {
  const themen = collectThemen(
    [
      n("01-Schule/Mathe/Mathe.md", { banner: "x" }),
      n("01-Schule/Mathe/Geraden.md", null, 100),
      n("01-Schule/Mathe/11/IV. Lokales und Globales Differenzieren/Extrempunkte.md", null, 300),
      n("01-Schule/Mathe/attachments/Skizze.md"),
      n("01-Schule/Mathe/Zeichnung.excalidraw.md", { "excalidraw-plugin": "parsed" }),
      n("01-Schule/Mathe/_Themen/Ebenen.md", { typ: "thema", fach: "[[Mathe]]" }, 50),
      n("01-Schule/Physik/Optik.md", null, 999),
      n("01-Schule/Physik/_Themen/Wellen.md", { typ: "thema", fach: "[[Physik]]" }),
      n("01-Schule/Mathe/13-1/Vektoren/2026-10-15 Mathe.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-15", themen: ["[[Vektoren]]"] }),
      n("01-Schule/Mathe/13-1/Geraden/2026-10-01 Mathe.md", { typ: "tagesnote", fach: "[[Mathe]]", datum: "2026-10-01", themen: ["[[Geraden]]"] }),
    ],
    mathe,
    cfg,
  );
  // zuletzt benutzt zuerst, dann nach Änderungszeit
  assert.deepEqual(themen, ["Vektoren", "Geraden", "Extrempunkte", "Ebenen"]);
});
