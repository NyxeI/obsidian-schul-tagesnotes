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
