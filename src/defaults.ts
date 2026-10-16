import { parseFaecher, parseHalbjahre, type BereichConfig, type Halbjahr, type PathConfig } from "./config.ts";
import { DEFAULT_TAG_ZUORDNUNG, type TagZuordnung } from "./stichworte.ts";

export interface JournalConfig {
  root: string;
  /** Kategorien (je ein Hub `<root>/<Kategorie>.md`). */
  kategorien: string[];
  /** Fester Notizblock (Seitenleiste), zugleich Hub der Kategorie "Notizblock". */
  notizblockPath: string;
  basePath: string;
  tagPrefix: string;
}

export interface TaskConfig {
  folder: string;
  tag: string;
  /** Weitere Notes/Ordner, deren offene Checkboxen mit TaskNotes verlinkt werden (neben Notizblock und ToDo-Journal). */
  quellen: string[];
}

export interface SchulSettings {
  bereiche: BereichConfig[];
  halbjahre: Halbjahr[];
  journal: JournalConfig;
  tasks: TaskConfig;
  /** Begriffe/Personen, die nicht automatisch verlinkt werden. */
  begriffeAusschluss: string[];
  /** Inline-Tags: alt (klein) → neu; "" = entfällt. Nicht aufgeführte Tags werden zu stichwort/<slug>. */
  tagZuordnung: TagZuordnung;
  /** Base mit der Ansicht „Verwaist“ (Notes ohne Links). */
  inboxBasePath: string;
  /** Tagesübersicht für Daily Notes / Calendar */
  tagBasePath: string;
  autoSort: boolean;
  autoCreateHubs: boolean;
}

const SCHULE: BereichConfig = {
  id: "schule",
  name: "Schule",
  root: "01-Schule",
  property: "fach",
  tagPrefix: "schule",
  zeitraum: "halbjahr",
  kategorien: parseFaecher(
    [
      "Chemie",
      "Deutsch",
      "Englisch",
      "Ethik",
      "Französisch",
      "Geographie",
      "Geschichte",
      "Informatik",
      "Kunst",
      "Mathe",
      "Physik",
      "PuG | Politik und Gesellschaft | politik",
      "Wirtschaft",
      "W-Seminar | W-Seminar | wsem",
      "P-Seminar | P-Seminar | pseminar",
      "Roboterbau",
    ].join("\n"),
  ),
  hubFolder: "_Themen",
  generalFolder: "_Allgemein",
  noHalbjahrFolder: "_Ohne Halbjahr",
  fileNamePattern: "{datum} {fach}",
  tagesnoteTemplate: "02-Ressourcen/02-3Templates/Tagesnote.md",
  hubTemplate: "02-Ressourcen/02-3Templates/Themen-Hub.md",
  kategorieBasePath: "01-Schule/_Bases/Fach.base",
  themaBasePath: "01-Schule/_Bases/Thema.base",
};

const PROJEKTE: BereichConfig = {
  id: "projekte",
  name: "Projekte",
  root: "04-Projekte",
  property: "projekt",
  tagPrefix: "projekt",
  zeitraum: "jahr",
  kategorien: parseFaecher(["Bonsai", "Cyberdeck", "Linux", "Meshtastic", "Server", "Non-planar Printing", "Roboterarm"].join("\n")),
  hubFolder: "_Themen",
  generalFolder: "_Allgemein",
  noHalbjahrFolder: "_Ohne Jahr",
  fileNamePattern: "{datum} {fach}",
  tagesnoteTemplate: "02-Ressourcen/02-3Templates/Projekt-Logbuch.md",
  hubTemplate: "02-Ressourcen/02-3Templates/Projekt-Themen-Hub.md",
  kategorieBasePath: "04-Projekte/_Bases/Projekt.base",
  // Thema.base ist allgemein (filtert über "themen") – eine Datei für alle Bereiche, damit ![[Thema.base]] eindeutig bleibt.
  themaBasePath: "01-Schule/_Bases/Thema.base",
};

export const DEFAULT_SETTINGS: SchulSettings = {
  bereiche: [SCHULE, PROJEKTE],
  // Q12 = Schuljahr 2025/26, Q13 = 2026/27 (Bayern, G9) – in den Einstellungen anpassbar.
  halbjahre: parseHalbjahre(
    [
      "12-1 | 2025-09-16 | 2026-02-13",
      "12-2 | 2026-02-14 | 2026-09-07",
      "13-1 | 2026-09-08 | 2027-02-12",
      "13-2 | 2027-02-13 | 2027-09-13",
    ].join("\n"),
  ),
  journal: {
    root: "05-Journal",
    kategorien: ["Notizblock", "ToDo", "Notiz", "Tagesplan"],
    notizblockPath: "05-Journal/Notizblock.md",
    basePath: "05-Journal/_Bases/Journal.base",
    tagPrefix: "journal",
  },
  tasks: { folder: "TaskNotes/Tasks", tag: "task", quellen: ["01-Schule/AufgabenFiles", "01-Schule/Hausaufgaben oder To - Do.md"] },
  begriffeAusschluss: [],
  tagZuordnung: { ...DEFAULT_TAG_ZUORDNUNG },
  inboxBasePath: "Inbox.base",
  tagBasePath: "05-Journal/_Bases/Tag.base",
  autoSort: true,
  autoCreateHubs: true,
};

/** Effektive Pfad-Konfiguration eines Bereichs. */
export function pathConfig(s: SchulSettings, b: BereichConfig): PathConfig {
  return { ...b, halbjahre: s.halbjahre };
}

/** Bequemer Zugriff auf den Schul-Bereich (erster Bereich mit id "schule"). */
export function schule(s: SchulSettings): PathConfig {
  return pathConfig(s, s.bereiche.find((b) => b.id === "schule") ?? s.bereiche[0]);
}

/** Bereich einer Note anhand ihrer Kategorie-Property (fach, projekt, …). */
export function bereichOf(s: SchulSettings, fm: Record<string, unknown> | null | undefined): PathConfig | null {
  if (!fm) return null;
  for (const b of s.bereiche) {
    const v = fm[b.property];
    if (v === undefined || v === null || v === "") continue;
    const name = String(Array.isArray(v) ? v[0] : v).replace(/^\[\[|\]\]$/g, "").split("|")[0].split("/").pop()?.trim().toLowerCase();
    if (b.kategorien.some((k) => k.name.toLowerCase() === name || k.folder.toLowerCase() === name)) return pathConfig(s, b);
  }
  return null;
}

/** Gespeicherte Daten mit Standardwerten zusammenführen (auch alte Einzelbereich-Einstellungen). */
export function mergeSettings(saved: Record<string, unknown> | null): SchulSettings {
  const s: SchulSettings = structuredClone(DEFAULT_SETTINGS);
  if (!saved) return s;
  if (Array.isArray(saved.bereiche)) s.bereiche = saved.bereiche as BereichConfig[];
  else if (Array.isArray(saved.faecher)) {
    // Version 0.1: Schul-Einstellungen lagen direkt auf oberster Ebene.
    const schule = s.bereiche[0];
    for (const key of ["root", "hubFolder", "generalFolder", "noHalbjahrFolder", "fileNamePattern", "tagesnoteTemplate", "hubTemplate", "themaBasePath"] as const) {
      if (typeof saved[key] === "string") schule[key] = saved[key] as string;
    }
    schule.kategorien = saved.faecher as BereichConfig["kategorien"];
  }
  if (Array.isArray(saved.halbjahre)) s.halbjahre = saved.halbjahre as SchulSettings["halbjahre"];
  if (saved.journal) s.journal = { ...s.journal, ...(saved.journal as object) };
  if (saved.tasks) s.tasks = { ...s.tasks, ...(saved.tasks as object) };
  if (Array.isArray(saved.begriffeAusschluss)) s.begriffeAusschluss = saved.begriffeAusschluss as string[];
  if (saved.tagZuordnung && typeof saved.tagZuordnung === "object") s.tagZuordnung = saved.tagZuordnung as TagZuordnung;
  if (typeof saved.inboxBasePath === "string") s.inboxBasePath = saved.inboxBasePath;
  if (typeof saved.tagBasePath === "string") s.tagBasePath = saved.tagBasePath;
  if (typeof saved.autoSort === "boolean") s.autoSort = saved.autoSort;
  if (typeof saved.autoCreateHubs === "boolean") s.autoCreateHubs = saved.autoCreateHubs;
  return s;
}
