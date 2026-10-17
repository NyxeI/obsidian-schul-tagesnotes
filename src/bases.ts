// Alle Base-Dateien des Plugins an einer Stelle – für „Templates und Base anlegen“ und „Base-Dateien auf Plugin-Stand bringen“.
import { pathConfig, type SchulSettings } from "./defaults.ts";
import {
  addBegriffeToKategorieBase,
  bereichBase,
  DEFAULT_INBOX_BASE,
  DEFAULT_JOURNAL_BASE,
  kategorieBase,
  tagBase,
} from "./templates.ts";

/** Pfad → Inhalt aller Bases; `dailyFormat` = Datumsformat der Daily Notes (für Tag.base). */
export function pluginBases(s: SchulSettings, dailyFormat = "YYYY-MM-DD"): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of s.bereiche) {
    const cfg = pathConfig(s, b);
    // Seit Migration v2 gibt es keine Themen-Hubs mehr: nur noch die Base des Kategorie-Hubs.
    out.set(cfg.kategorieBasePath, addBegriffeToKategorieBase(kategorieBase(cfg.property, cfg.zeitraum)));
  }
  out.set(s.bereichBasePath, bereichBase(s.bereiche.filter((b) => b.hubPath).map((b) => ({ name: b.name, property: b.property, root: b.root }))));
  out.set(s.journal.basePath, DEFAULT_JOURNAL_BASE);
  out.set(s.inboxBasePath, DEFAULT_INBOX_BASE);
  out.set(s.tagBasePath, tagBase(dailyFormat));
  return out;
}
