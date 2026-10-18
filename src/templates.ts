// Standard-Templates und Platzhalter-Ersetzung (ohne Obsidian-Abhängigkeit).
import { spaltenBreiten, tabellenBreite } from "./spalten.ts";

export const DEFAULT_TAGESNOTE_TEMPLATE = `---
typ: tagesnote
{{property}}: "[[{{fach}}]]"
datum: {{datum}}
halbjahr: {{halbjahr}}
thema: "{{thema}}"
tags: []
---
# {{fach}}, {{datum}}

`;

export const DEFAULT_HUB_TEMPLATE = `---
typ: thema
{{property}}: "[[{{fach}}]]"
tags: []
---
# {{thema}}

## Tagesnotes
![[{{base}}]]
`;

export const DEFAULT_THEMA_BASE = `# Hinweis: Filter mit "this" müssen in den einzelnen Ansichten stehen (global greifen sie nicht).
# Wird in Themen-Hubs eingebettet: zeigt alle Tagesnotes, deren "themen" diesen Hub enthält.
# Ansicht über das Dropdown oben links wechseln; "Sort"/"Group" ändern die Ansicht für alle Hubs.
filters:
  and:
    - typ == "tagesnote"
views:
  - type: table
    name: Nach Datum
    filters:
      and:
        - list(note.themen).contains(this.file.asLink())
    order:
      - file.name
      - datum
      - halbjahr
      - themen
      - file.tags
    sort:
      - property: datum
        direction: DESC
  - type: table
    name: Nach Halbjahr
    filters:
      and:
        - list(note.themen).contains(this.file.asLink())
    groupBy:
      property: halbjahr
      direction: DESC
    order:
      - file.name
      - datum
      - halbjahr
      - themen
      - file.tags
    sort:
      - property: datum
        direction: DESC
  - type: table
    name: Nach Themen
    filters:
      and:
        - list(note.themen).contains(this.file.asLink())
    groupBy:
      property: themen
      direction: ASC
    order:
      - file.name
      - datum
      - halbjahr
      - themen
      - file.tags
    sort:
      - property: datum
        direction: DESC
  - type: table
    name: Nach Tags
    filters:
      and:
        - list(note.themen).contains(this.file.asLink())
    groupBy:
      property: file.tags
      direction: ASC
    order:
      - file.name
      - datum
      - halbjahr
      - themen
      - file.tags
    sort:
      - property: datum
        direction: DESC
  - type: table
    name: Älteste zuerst
    filters:
      and:
        - list(note.themen).contains(this.file.asLink())
    order:
      - file.name
      - datum
      - halbjahr
      - themen
      - file.tags
    sort:
      - property: datum
        direction: ASC
`;

/**
 * Base für Kategorie-Hubs (Fach, Projekt) – seit Migration v2 der einzige Hub: alle datierten Notes der Kategorie.
 * Bei Zeitraum "jahr" wird nach Jahr statt Halbjahr gruppiert.
 */
export function kategorieBase(property: string, zeitraum: "halbjahr" | "jahr" = "halbjahr"): string {
  const mine = `        - list(note.${property}).contains(this.file.asLink())
        - typ == "tagesnote"
`;
  const view = (name: string, extra: string, order: string[], sort = "      - property: datum\n        direction: DESC\n") =>
    `  - type: table
    name: ${name}
    rowHeight: medium
    columnSize:
${Object.entries(spaltenBreiten(order, tabellenBreite(false)))
  .map(([k, w]) => `      ${k}: ${w}`)
  .join("\n")}
    filters:
      and:
${mine}${extra}    order:
${order.map((o) => `      - ${o}`).join("\n")}
    sort:
${sort}`;
  const group = (prop: string, dir = "ASC") => `    groupBy:\n      property: ${prop}\n      direction: ${dir}\n`;
  const chrono = "      - property: datum\n        direction: ASC\n      - property: file.name\n        direction: ASC\n";
  const zeitraumProp = zeitraum === "jahr" ? "formula.jahr" : "halbjahr";
  const views = [
    view("Nach Datum", "", ["file.name", "thema", "abschnitt"]),
    view(zeitraum === "jahr" ? "Nach Jahr" : "Nach Halbjahr", "", ["file.name", "thema", "abschnitt"]).replace("    order:", `${group(zeitraumProp, "DESC")}    order:`),
    view("Nach Thema", "", ["file.name", "abschnitt", "unterthemen"], chrono).replace("    order:", `${group("thema")}    order:`),
    view("Nach Kapitel", "", ["file.name", "thema", "abschnitt"], chrono).replace("    order:", `${group("kapitel")}    order:`),
    view("Unterthemen", "", ["file.name", "thema", "unterthemen"]),
    view("Abi-relevant", '        - file.hasTag("markierung/abi-relevant")\n', ["file.name", "thema", "abschnitt"]),
    view("Datum prüfen", "        - datum_geschaetzt == true\n", ["file.name", "datum", "thema", "abschnitt"], chrono),
  ];
  return `# Einziger Hub der Kategorie (Fach, Projekt): alle datierten Notes über die Property "${property}".
# Ansicht über das Dropdown wechseln. "Datum prüfen" zeigt Notes, deren Datum aus dem Dateidatum geschätzt wurde.
${zeitraum === "jahr" ? "formulas:\n  jahr: date(datum).year\n" : ""}properties:
  file.name:
    displayName: Note
  note.thema:
    displayName: Thema
  note.abschnitt:
    displayName: Abschnitt
  note.unterthemen:
    displayName: Unterthemen
  note.kapitel:
    displayName: Kapitel
  note.datum:
    displayName: Datum
filters:
  and:
    - file.ext == "md"
views:
${views.join("")}`;
}

export const DEFAULT_FACH_BASE = kategorieBase("fach");

export interface TemplateVars {
  fach: string;
  datum: string;
  /** null = Bereich ohne Halbjahre: die Zeile "halbjahr: …" entfällt. */
  halbjahr: string | null;
  /** Name der Kategorie-Property (Standard "fach"). */
  property?: string;
  /** Themen ohne Klammern; leer = keine Themen. */
  themen: string[];
  base: string;
}

/** Ersetzt {{property}}, {{fach}}, {{datum}}, {{halbjahr}}, {{thema}}, {{themen}} (YAML-Liste) und {{base}}. */
export function renderTemplate(template: string, v: TemplateVars): string {
  const themenYaml = v.themen.length
    ? v.themen.map((t) => `  - "[[${t}]]"`).join("\n")
    : "  []";
  let out = template;
  if (v.halbjahr === null) out = out.replace(/^halbjahr:[ \t]*\{\{halbjahr\}\}[ \t]*\r?\n/m, "");
  // Thema als YAML-Doppelquote-String (JSON ist gültiges YAML): "{{thema}}" und unquotiert als Frontmatter-Wert.
  const thema = JSON.stringify(v.themen[0] ?? "");
  out = out.replace(/"\{\{thema\}\}"/g, () => thema);
  out = out.replace(/^---\r?\n[\s\S]*?\r?\n---/, (fm) =>
    fm.replace(/^(thema:[ \t]*)\{\{thema\}\}[ \t]*$/gm, (_m, k: string) => k + thema),
  );
  return out
    .replace(/\{\{property\}\}/g, v.property ?? "fach")
    .replace(/\{\{themen\}\}/g, themenYaml)
    .replace(/\{\{fach\}\}/g, v.fach)
    .replace(/\{\{datum\}\}/g, v.datum)
    .replace(/\{\{halbjahr\}\}/g, v.halbjahr ?? "")
    .replace(/\{\{thema\}\}/g, v.themen[0] ?? "")
    .replace(/\{\{base\}\}/g, v.base);
}

export const DEFAULT_JOURNAL_BASE = `# Journal: datierte Notes (Notizblock-Archiv, ToDo, Notiz, Tagesplan).
# "Archiv" wird in den Kategorie-Hubs eingebettet (![[Journal.base#Archiv]]) und zeigt deren Notes.
formulas:
  monat: date(datum).format("YYYY-MM")

filters:
  and:
    - typ == "journal"
views:
  - type: table
    name: Archiv
    filters:
      and:
        - list(note.kategorie).contains(this.file.asLink())
    order:
      - file.name
      - datum
      - uhrzeit
      - file.tags
    sort:
      - property: datum
        direction: DESC
      - property: uhrzeit
        direction: DESC
  - type: table
    name: Alle nach Datum
    order:
      - file.name
      - kategorie
      - datum
      - uhrzeit
    sort:
      - property: datum
        direction: DESC
      - property: uhrzeit
        direction: DESC
  - type: table
    name: Nach Monat
    groupBy:
      property: formula.monat
      direction: DESC
    order:
      - file.name
      - kategorie
      - datum
    sort:
      - property: datum
        direction: DESC
  - type: table
    name: Nach Kategorie
    groupBy:
      property: kategorie
      direction: ASC
    order:
      - file.name
      - datum
      - uhrzeit
    sort:
      - property: datum
        direction: DESC
`;

/** Zusatz-Ansicht für Thema.base: Begriffe/Personen, deren "themen" diesen Hub enthält. */
export const BEGRIFFE_VIEW_THEMA = `  - type: table
    name: Begriffe
    filters:
      and:
        - list(note.themen).contains(this.file.asLink())
        - or:
            - typ == "begriff"
            - typ == "person"
    order:
      - file.name
      - typ
      - themen
    sort:
      - property: file.name
        direction: ASC
`;

/** Zusatz-Ansicht für Fach.base/Projekt.base: Begriffe/Personen mit dieser Kategorie in "kategorien". */
export const BEGRIFFE_VIEW_KATEGORIE = `  - type: table
    name: Begriffe
    filters:
      and:
        - list(note.kategorien).contains(this.file.asLink())
        - or:
            - typ == "begriff"
            - typ == "person"
    order:
      - file.name
      - typ
      - themen
    sort:
      - property: file.name
        direction: ASC
`;

/**
 * Thema.base um die Ansicht „Begriffe“ erweitern. Der globale Filter typ == "tagesnote" würde Begriffe
 * ausblenden – er wandert deshalb in die vorhandenen Ansichten, global bleibt file.ext == "md".
 */
export function addBegriffeToThemaBase(text: string): string {
  if (text.includes("name: Begriffe\n")) return text;
  let out = text.replace(/(filters:\n  and:\n)    - typ == "tagesnote"\n(views:)/, '$1    - file.ext == "md"\n$2');
  if (out !== text) {
    out = out.replace(/^( {8}- list\(note\.themen\)\.contains\(this\.file\.asLink\(\)\)\n)/gm, '$1        - typ == "tagesnote"\n');
  }
  return out.replace(/\s*$/, "\n") + BEGRIFFE_VIEW_THEMA;
}

/** Kategorie-Base um „Begriffe“ erweitern (Ansichten filtern dort schon selbst nach typ). */
export function addBegriffeToKategorieBase(text: string): string {
  if (text.includes("name: Begriffe\n")) return text;
  return text.replace(/\s*$/, "\n") + BEGRIFFE_VIEW_KATEGORIE;
}

/** Inbox: Notes ohne ein- und ausgehende Links (außer TaskNotes, Templates, Bases). */
export const DEFAULT_INBOX_BASE = `# Verwaiste Notes zum Durchsehen – nichts wird automatisch gelöscht.
filters:
  and:
    - file.ext == "md"
    - '!file.inFolder("TaskNotes")'
    - '!file.inFolder("02-Ressourcen/02-3Templates")'
views:
  - type: table
    name: Verwaist
    filters:
      and:
        - file.backlinks.length == 0
        - file.links.length == 0
    order:
      - file.name
      - file.folder
      - file.mtime
    sort:
      - property: file.mtime
        direction: DESC
  - type: table
    name: Ohne Backlinks
    filters:
      and:
        - file.backlinks.length == 0
    groupBy:
      property: file.folder
      direction: ASC
    order:
      - file.name
      - file.mtime
    sort:
      - property: file.name
        direction: ASC
`;

/** Ansichten mit Unterthemen für Thema.base. */
export const UNTERTHEMEN_VIEWS_THEMA: [string, string][] = [
  [
    "Unterthemen",
    `  - type: table
    name: Unterthemen
    filters:
      and:
        - list(note.themen).contains(this.file.asLink())
        - typ == "tagesnote"
    order:
      - file.name
      - datum
      - unterthemen
      - file.tags
    sort:
      - property: datum
        direction: DESC
`,
  ],
];

/** Ansichten für Kategorie-Bases: Themen mit Unterthemen, Abi-relevante Notes. */
export function UNTERTHEMEN_VIEWS_KATEGORIE(property: string): [string, string][] {
  return [
    [
      "Unterthemen",
      `  - type: table
    name: Unterthemen
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - or:
            - typ == "thema"
            - typ == "tagesnote"
    order:
      - file.name
      - kapitel
      - unterthemen
      - file.tags
    sort:
      - property: file.name
        direction: ASC
`,
    ],
    [
      "Abi-relevant",
      `  - type: table
    name: Abi-relevant
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - file.hasTag("markierung/abi-relevant")
    order:
      - file.name
      - typ
      - unterthemen
    sort:
      - property: file.name
        direction: ASC
`,
    ],
  ];
}

/** Ansichten anhängen, die es (nach Name) noch nicht gibt. */
export function addViews(text: string, views: [string, string][]): string {
  let out = text;
  for (const [name, yaml] of views) {
    if (out.includes(`name: ${name}\n`)) continue;
    out = out.replace(/\s*$/, "\n") + yaml;
  }
  return out;
}

/**
 * Tagesübersicht für die Daily Note (Calendar-Plugin): alle Tagesnotes und Journal-Notes vom Datum der Daily Note.
 * `format` = Datumsformat der Daily Notes (moment), damit der Dateiname mit `datum` verglichen werden kann.
 */
export function tagBase(format: string): string {
  const f = format.replace(/"/g, '\\"');
  return `# Tagesübersicht: wird in der Daily Note eingebettet (![[Tag.base]]) und zeigt alles vom selben Datum.
properties:
  file.name:
    displayName: Note
  note.fach:
    displayName: Fach
  note.projekt:
    displayName: Projekt
  note.thema:
    displayName: Thema
  note.kategorie:
    displayName: Kategorie
  note.uhrzeit:
    displayName: Uhrzeit
filters:
  and:
    - file.ext == "md"
    - date(datum).format("${f}") == this.file.name
views:
  - type: table
    name: Heute
    filters:
      or:
        - typ == "tagesnote"
        - typ == "journal"
    groupBy:
      property: typ
      direction: DESC
    order:
      - file.name
      - fach
      - projekt
      - thema
      - kategorie
      - uhrzeit
    sort:
      - property: uhrzeit
        direction: ASC
      - property: file.name
        direction: ASC
`;
}

/** Einbettung der Tagesübersicht ans Ende einer Daily-Note-Vorlage anhängen (einmalig). */
export function addTagBaseEmbed(template: string, baseName: string): string {
  if (template.includes(`![[${baseName}`)) return template;
  return `${template.replace(/\s*$/, "")}\n\n## Heute\n![[${baseName}]]\n`;
}

/** Bereich, wie ihn die Übersichts-Base braucht. */
export interface BereichKarte {
  name: string;
  /** Property der Kategorie = `typ` des Kategorie-Hubs ("fach", "projekt"). */
  property: string;
  root: string;
}

/**
 * Übersicht für den Haupt-Hub eines Bereichs (Schule.md, 04 Projekte.md): eine Karten-Ansicht pro Bereich,
 * je Karte ein Kategorie-Hub mit Banner, Anzahl Tagesnotes und letzter Tagesnote.
 */
export function bereichBase(bereiche: BereichKarte[]): string {
  const views = bereiche
    .map(
      (b) => `  - type: cards
    name: ${b.name}
    filters:
      and:
        - typ == "${b.property}"
        - file.inFolder("${b.root}")
    image: formula.cover
    imageAspectRatio: 0.5
    cardSize: 180
    order:
      - file.name
      - formula.tagesnotes
      - formula.zuletzt
    sort:
      - property: file.name
        direction: ASC
`,
    )
    .join("");
  return `# Übersicht für Bereichs-Hubs: Karten der Kategorie-Hubs (Fächer, Projekte). Eingebettet als ![[Bereich.base#<Bereich>]].
# Banner: URL, "[[bild.jpg]]" oder Pfad – die Formel macht daraus ein Titelbild.
formulas:
  cover: 'if(banner, if(banner.toString().startsWith("http"), banner.toString(), link(banner.toString().replace("[[", "").replace("]]", ""))), "")'
  tagesnotes: file.backlinks.filter(value.asFile().properties.typ == "tagesnote").length
  zuletzt: 'if(formula.tagesnotes > 0, date(file.backlinks.filter(value.asFile().properties.typ == "tagesnote").map(value.asFile().properties.datum).sort().reverse()[0]).format("DD.MM.YYYY"), "")'
properties:
  formula.tagesnotes:
    displayName: Tagesnotes
  formula.zuletzt:
    displayName: Zuletzt
filters:
  and:
    - file.ext == "md"
views:
${views}`;
}

/**
 * Hub-Ansichten entschlacken: Spalten, die Dateiname, Ordner oder Gruppierung schon zeigen, fallen weg
 * (Datum steckt im Dateinamen der Tagesnote, Halbjahr im Ordner, Tags in Fach/Themen); Themen-Hub-Listen werden zu Listen.
 */
export function slimBase(text: string): string {
  const namen = /^properties:/m.test(text)
    ? text
    : text.replace(
        /^filters:/m,
        `properties:
  file.name:
    displayName: Note
  file.mtime:
    displayName: Geändert
  note.themen:
    displayName: Themen
  note.unterthemen:
    displayName: Unterthemen
  note.kapitel:
    displayName: Kapitel
  note.typ:
    displayName: Typ
filters:`,
      );
  return namen
    .replace(/^ {6}- (file\.tags|datum|halbjahr)\n/gm, "")
    .replace(/  - type: table\n    name: (Themen-Hubs(?: zuletzt geändert)?|Themen nach Kapitel)\n/g, "  - type: list\n    name: $1\n");
}
