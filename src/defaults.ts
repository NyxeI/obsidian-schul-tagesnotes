import { parseFaecher, parseHalbjahre, type PathConfig } from "./config.ts";

export interface SchulSettings extends PathConfig {
  tagesnoteTemplate: string;
  hubTemplate: string;
  /** Base für Themen-Hubs ({{base}} im Hub-Template). */
  themaBasePath: string;
  /** Base für Fach-Hubs. */
  fachBasePath: string;
  autoSort: boolean;
  autoCreateHubs: boolean;
}

export const DEFAULT_SETTINGS: SchulSettings = {
  root: "01-Schule",
  hubFolder: "_Themen",
  generalFolder: "_Allgemein",
  noHalbjahrFolder: "_Ohne Halbjahr",
  fileNamePattern: "{datum} {fach}",
  faecher: parseFaecher(
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
    ].join("\n"),
  ),
  // Q12 = Schuljahr 2025/26, Q13 = 2026/27 (Bayern, G9) – in den Einstellungen anpassbar.
  halbjahre: parseHalbjahre(
    [
      "12-1 | 2025-09-16 | 2026-02-13",
      "12-2 | 2026-02-14 | 2026-09-07",
      "13-1 | 2026-09-08 | 2027-02-12",
      "13-2 | 2027-02-13 | 2027-09-13",
    ].join("\n"),
  ),
  tagesnoteTemplate: "02-Ressourcen/02-3Templates/Tagesnote.md",
  hubTemplate: "02-Ressourcen/02-3Templates/Themen-Hub.md",
  themaBasePath: "01-Schule/_Bases/Thema.base",
  fachBasePath: "01-Schule/_Bases/Fach.base",
  autoSort: true,
  autoCreateHubs: true,
};
