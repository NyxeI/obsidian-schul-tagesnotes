// Standard-Templates und Platzhalter-Ersetzung (ohne Obsidian-Abhängigkeit).

export const DEFAULT_TAGESNOTE_TEMPLATE = `---
typ: tagesnote
fach: "[[{{fach}}]]"
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
fach: "[[{{fach}}]]"
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

export const DEFAULT_FACH_BASE = `# Wird im Fach-Hub eingebettet: Tagesnotes und Themen-Hubs des Fachs (über die Property "fach").
filters:
  and:
    - file.ext == "md"
views:
  - type: table
    name: Tagesnotes nach Datum
    filters:
      and:
        - list(note.fach).contains(this.file.asLink())
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
        - list(note.fach).contains(this.file.asLink())
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
        - list(note.fach).contains(this.file.asLink())
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
        - list(note.fach).contains(this.file.asLink())
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
        - list(note.fach).contains(this.file.asLink())
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
        - list(note.fach).contains(this.file.asLink())
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

export interface TemplateVars {
  fach: string;
  datum: string;
  halbjahr: string;
  /** Themen ohne Klammern; leer = keine Themen. */
  themen: string[];
  base: string;
}

/** Ersetzt {{fach}}, {{datum}}, {{halbjahr}}, {{thema}}, {{themen}} (YAML-Liste) und {{base}}. */
export function renderTemplate(template: string, v: TemplateVars): string {
  const themenYaml = v.themen.length
    ? v.themen.map((t) => `  - "[[${t}]]"`).join("\n")
    : "  []";
  return template
    .replace(/\{\{themen\}\}/g, themenYaml)
    .replace(/\{\{fach\}\}/g, v.fach)
    .replace(/\{\{datum\}\}/g, v.datum)
    .replace(/\{\{halbjahr\}\}/g, v.halbjahr)
    .replace(/\{\{thema\}\}/g, v.themen[0] ?? "")
    .replace(/\{\{base\}\}/g, v.base);
}
