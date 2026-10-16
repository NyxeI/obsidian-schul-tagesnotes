// Alle Base-Dateien des Plugins an einer Stelle – für „Templates und Base anlegen“ und „Base-Dateien auf Plugin-Stand bringen“.
import { pathConfig, type SchulSettings } from "./defaults.ts";
import { kapitelView } from "./hublinks.ts";
import {
  addBegriffeToKategorieBase,
  addBegriffeToThemaBase,
  addViews,
  bereichBase,
  DEFAULT_INBOX_BASE,
  DEFAULT_JOURNAL_BASE,
  DEFAULT_THEMA_BASE,
  kategorieBase,
  slimBase,
  tagBase,
  UNTERTHEMEN_VIEWS_KATEGORIE,
  UNTERTHEMEN_VIEWS_THEMA,
} from "./templates.ts";

/** Pfad → Inhalt aller Bases; `dailyFormat` = Datumsformat der Daily Notes (für Tag.base). */
export function pluginBases(s: SchulSettings, dailyFormat = "YYYY-MM-DD"): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of s.bereiche) {
    const cfg = pathConfig(s, b);
    out.set(cfg.themaBasePath, slimBase(addViews(addBegriffeToThemaBase(DEFAULT_THEMA_BASE), UNTERTHEMEN_VIEWS_THEMA)));
    out.set(
      cfg.kategorieBasePath,
      slimBase(
        addViews(addBegriffeToKategorieBase(kategorieBase(cfg.property, cfg.zeitraum)), [...UNTERTHEMEN_VIEWS_KATEGORIE(cfg.property), kapitelView(cfg.property)]),
      ),
    );
  }
  out.set(s.bereichBasePath, bereichBase(s.bereiche.filter((b) => b.hubPath).map((b) => ({ name: b.name, property: b.property, root: b.root }))));
  out.set(s.journal.basePath, DEFAULT_JOURNAL_BASE);
  out.set(s.inboxBasePath, DEFAULT_INBOX_BASE);
  out.set(s.tagBasePath, tagBase(dailyFormat));
  return out;
}
