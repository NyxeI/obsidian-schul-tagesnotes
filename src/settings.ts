import { App, PluginSettingTab, Setting } from "obsidian";
import type SchulTagesnotesPlugin from "./main";
import { formatFaecher, formatHalbjahre, parseFaecher, parseHalbjahre } from "./config.ts";
import { DEFAULT_SETTINGS } from "./defaults.ts";

export { DEFAULT_SETTINGS, type SchulSettings } from "./defaults.ts";

export class SchulSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SchulTagesnotesPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = () => this.plugin.saveSettings();
    containerEl.empty();

    new Setting(containerEl).setName("Ablage").setHeading();
    const text = (name: string, desc: string, key: "root" | "hubFolder" | "generalFolder" | "noHalbjahrFolder" | "fileNamePattern") =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) =>
          t.setValue(s[key]).onChange(async (v) => {
            s[key] = v.trim() || DEFAULT_SETTINGS[key];
            await save();
          }),
        );
    text("Schulordner", "Darunter liegt pro Fach ein Ordner.", "root");
    text("Ordner für Themen-Hubs", "Unterordner im Fachordner, z. B. _Themen.", "hubFolder");
    text("Ordner ohne Thema", "Für Tagesnotes ohne Eintrag in „themen“.", "generalFolder");
    text("Ordner ohne Halbjahr", "Wenn das Datum in keinem Halbjahr liegt.", "noHalbjahrFolder");
    text("Dateiname", "Platzhalter {datum} und {fach}.", "fileNamePattern");

    new Setting(containerEl)
      .setName("Fächer")
      .setDesc("Eine Zeile pro Fach: Name | Ordner | tag. Ordner und Tag dürfen fehlen.")
      .addTextArea((t) => {
        t.inputEl.rows = 10;
        t.inputEl.cols = 45;
        t.setValue(formatFaecher(s.faecher)).onChange(async (v) => {
          s.faecher = parseFaecher(v);
          await save();
        });
      });

    new Setting(containerEl)
      .setName("Halbjahre")
      .setDesc("Eine Zeile pro Halbjahr: Name | Start | Ende (YYYY-MM-DD, jeweils inklusive).")
      .addTextArea((t) => {
        t.inputEl.rows = 6;
        t.inputEl.cols = 45;
        t.setValue(formatHalbjahre(s.halbjahre)).onChange(async (v) => {
          s.halbjahre = parseHalbjahre(v);
          await save();
        });
      });

    new Setting(containerEl).setName("Vorlagen und Ansichten").setHeading();
    const path = (name: string, desc: string, key: "tagesnoteTemplate" | "hubTemplate" | "themaBasePath" | "fachBasePath") =>
      new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((t) =>
          t.setValue(s[key]).onChange(async (v) => {
            s[key] = v.trim() || DEFAULT_SETTINGS[key];
            await save();
          }),
        );
    path("Template Tagesnote", "Fehlt die Datei, wird das eingebaute Template verwendet.", "tagesnoteTemplate");
    path("Template Themen-Hub", "Fehlt die Datei, wird das eingebaute Template verwendet.", "hubTemplate");
    path("Base für Themen-Hubs", "Wird im Themen-Hub eingebettet (Platzhalter {{base}}).", "themaBasePath");
    path("Base für Fach-Hubs", "Zum Einbetten im Fach-Hub, z. B. ![[Fach.base]].", "fachBasePath");

    new Setting(containerEl).setName("Automatik").setHeading();
    new Setting(containerEl)
      .setName("Automatisch einsortieren")
      .setDesc("Tagesnotes wandern nach jeder Änderung von fach, datum oder themen in ihren Ordner; Tags und Halbjahr werden angepasst.")
      .addToggle((t) =>
        t.setValue(s.autoSort).onChange(async (v) => {
          s.autoSort = v;
          await save();
        }),
      );
    new Setting(containerEl)
      .setName("Themen-Hubs automatisch anlegen")
      .setDesc("Verweist „themen“ auf eine Note, die es nicht gibt, wird sie im Ordner für Themen-Hubs angelegt.")
      .addToggle((t) =>
        t.setValue(s.autoCreateHubs).onChange(async (v) => {
          s.autoCreateHubs = v;
          await save();
        }),
      );
  }
}
