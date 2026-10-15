// Standard-Templates und Platzhalter-Ersetzung (ohne Obsidian-Abhängigkeit).

export const DEFAULT_TAGESNOTE_TEMPLATE = `---
typ: tagesnote
{{property}}: "[[{{fach}}]]"
datum: {{datum}}
halbjahr: {{halbjahr}}
themen:
{{themen}}
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

/** Base für Kategorie-Hubs (Fach, Projekt). Bei Zeitraum "jahr" wird nach Jahr statt Halbjahr gruppiert. */
export function kategorieBase(property: string, zeitraum: "halbjahr" | "jahr" = "halbjahr"): string {
  const base = `# Wird im Kategorie-Hub (Fach, Projekt) eingebettet: Tagesnotes und Themen-Hubs der Kategorie (über die Property "${property}").
filters:
  and:
    - file.ext == "md"
views:
  - type: table
    name: Tagesnotes nach Datum
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - typ == "tagesnote"
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
    name: Tagesnotes nach Halbjahr
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - typ == "tagesnote"
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
    name: Tagesnotes nach Themen
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - typ == "tagesnote"
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
    name: Tagesnotes nach Tags
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - typ == "tagesnote"
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
    name: Themen-Hubs
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - typ == "thema"
    order:
      - file.name
      - kapitel
      - file.tags
      - file.mtime
    sort:
      - property: file.name
        direction: ASC
  - type: table
    name: Themen-Hubs zuletzt geändert
    filters:
      and:
        - list(note.${property}).contains(this.file.asLink())
        - typ == "thema"
    order:
      - file.name
      - kapitel
      - file.tags
      - file.mtime
    sort:
      - property: file.mtime
        direction: DESC
`;
  if (zeitraum === "halbjahr") return base;
  return base
    .replace("filters:\n", "formulas:\n  jahr: date(datum).year\n\nfilters:\n")
    .replace("Tagesnotes nach Halbjahr", "Tagesnotes nach Jahr")
    .replace(/property: halbjahr/g, "property: formula.jahr")
    .replace(/      - halbjahr\n/g, "");
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
