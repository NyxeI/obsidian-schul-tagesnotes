import { App, PluginSettingTab, Setting } from "obsidian";
import type SchulTagesnotesPlugin from "./main";
import { formatFaecher, formatHalbjahre, parseFaecher, parseHalbjahre, type BereichConfig } from "./config.ts";
export { DEFAULT_SETTINGS, mergeSettings, type SchulSettings } from "./defaults.ts";

export class SchulSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SchulTagesnotesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();

    // ---------- Allgemein ----------
    new Setting(containerEl).setName("Allgemein").setHeading();
    new Setting(containerEl)
      .setName("Halbjahre")
      .setDesc("Für Bereiche mit Zeitraum „Halbjahr“. Eine Zeile pro Halbjahr: Name | Start | Ende (YYYY-MM-DD, jeweils inklusive).")
      .addTextArea((t) => {
        t.inputEl.rows = 5;
        t.inputEl.cols = 45;
        t.setValue(formatHalbjahre(s.halbjahre)).onChange(async (v) => {
          s.halbjahre = parseHalbjahre(v);
          await save();
        });
      });
    new Setting(containerEl)
      .setName("Automatisch einsortieren")
      .setDesc("Tagesnotes und Journal-Notes wandern nach jeder Änderung ihrer Properties in den passenden Ordner; Tags werden angepasst.")
      .addToggle((t) =>
        t.setValue(s.autoSort).onChange(async (v) => {
          s.autoSort = v;
          await save();
        }),
      );
    new Setting(containerEl)
      .setName("Themen-Hubs automatisch anlegen")
      .setDesc("Verweist „themen“ auf eine Note, die es nicht gibt, wird sie im Themen-Ordner der Kategorie angelegt.")
      .addToggle((t) =>
        t.setValue(s.autoCreateHubs).onChange(async (v) => {
          s.autoCreateHubs = v;
          await save();
        }),
      );

    // ---------- Bereiche ----------
    for (const b of s.bereiche) this.bereichSection(containerEl, b, save);

    // ---------- Journal ----------
    new Setting(containerEl).setName("Journal").setHeading();
    const j = s.journal;
    this.text(containerEl, "Journal-Ordner", "Notes landen in <Ordner>/<Jahr>/<Jahr-Monat>/.", j.root, (v) => (j.root = v), save);
    this.text(containerEl, "Notizblock", "Feste Notizblock-Note (Seitenleiste), zugleich Hub der Kategorie Notizblock.", j.notizblockPath, (v) => (j.notizblockPath = v), save);
    this.text(containerEl, "Journal-Base", "Ansichten für die Journal-Hubs.", j.basePath, (v) => (j.basePath = v), save);
    new Setting(containerEl)
      .setName("Journal-Kategorien")
      .setDesc("Eine pro Zeile. Zu jeder Kategorie gibt es einen Hub <Journal-Ordner>/<Kategorie>.md.")
      .addTextArea((t) => {
        t.inputEl.rows = 4;
        t.setValue(j.kategorien.join("\n")).onChange(async (v) => {
          j.kategorien = v.split("\n").map((x) => x.trim()).filter(Boolean);
          await save();
        });
      });

    // ---------- Aufgaben ----------
    new Setting(containerEl).setName("Aufgaben (TaskNotes)").setHeading();
    this.text(containerEl, "Ordner für Aufgaben", "Wie in den TaskNotes-Einstellungen.", s.tasks.folder, (v) => (s.tasks.folder = v), save);
    this.text(containerEl, "Aufgaben-Tag", "Tag, an dem TaskNotes Aufgaben erkennt.", s.tasks.tag, (v) => (s.tasks.tag = v), save);
  }

  private bereichSection(el: HTMLElement, b: BereichConfig, save: () => Promise<void>): void {
    new Setting(el).setName(`Bereich: ${b.name}`).setHeading();
    this.text(el, "Ordner", "Darunter liegt pro Kategorie ein Ordner.", b.root, (v) => (b.root = v), save);
    new Setting(el)
      .setName(b.property === "fach" ? "Fächer" : "Kategorien")
      .setDesc("Eine Zeile pro Kategorie: Name | Ordner | tag. Der Name muss dem Hub entsprechen (<Ordner>/<Name>.md).")
      .addTextArea((t) => {
        t.inputEl.rows = 8;
        t.inputEl.cols = 45;
        t.setValue(formatFaecher(b.kategorien)).onChange(async (v) => {
          b.kategorien = parseFaecher(v);
          await save();
        });
      });
    new Setting(el)
      .setName("Zeitraum-Ordner")
      .setDesc("Halbjahr (13-1) oder Kalenderjahr (2026).")
      .addDropdown((d) =>
        d
          .addOptions({ halbjahr: "Halbjahr", jahr: "Jahr" })
          .setValue(b.zeitraum)
          .onChange(async (v) => {
            b.zeitraum = v as BereichConfig["zeitraum"];
            await save();
          }),
      );
    this.text(el, "Ordner für Themen-Hubs", "Unterordner der Kategorie, z. B. _Themen.", b.hubFolder, (v) => (b.hubFolder = v), save);
    this.text(el, "Ordner ohne Thema", "Für Tagesnotes ohne Eintrag in „themen“.", b.generalFolder, (v) => (b.generalFolder = v), save);
    this.text(el, "Ordner ohne Zeitraum", "Wenn das Datum in keinem Halbjahr liegt.", b.noHalbjahrFolder, (v) => (b.noHalbjahrFolder = v), save);
    this.text(el, "Dateiname", "Platzhalter {datum} und {fach}.", b.fileNamePattern, (v) => (b.fileNamePattern = v), save);
    this.text(el, "Template Tagesnote", "Fehlt die Datei, wird das eingebaute Template verwendet.", b.tagesnoteTemplate, (v) => (b.tagesnoteTemplate = v), save);
    this.text(el, "Template Themen-Hub", "Fehlt die Datei, wird das eingebaute Template verwendet.", b.hubTemplate, (v) => (b.hubTemplate = v), save);
    this.text(el, "Base für Kategorie-Hubs", "Wird im Hub der Kategorie eingebettet.", b.kategorieBasePath, (v) => (b.kategorieBasePath = v), save);
    this.text(el, "Base für Themen-Hubs", "Platzhalter {{base}} im Hub-Template.", b.themaBasePath, (v) => (b.themaBasePath = v), save);
  }

  private text(el: HTMLElement, name: string, desc: string, value: string, set: (v: string) => void, save: () => Promise<void>): void {
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addText((t) =>
        t.setValue(value).onChange(async (v) => {
          if (!v.trim()) return;
          set(v.trim());
          await save();
        }),
      );
  }
}
