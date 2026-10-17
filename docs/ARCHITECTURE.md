# Architecture

## Principles

- **Pure logic is separate from Obsidian.** Modules marked *pure* below import nothing from `obsidian` and are tested directly with `node --test`. Modules that do import Obsidian are tested against a small fake API (`tests/support/fake-obsidian.ts`).
- **Plan, then apply.** Bulk operations first build a plan. Dry-run scripts and confirmation dialogs show it, and only then is it applied (`plan.ts` → `apply.ts`, `planBegriffe` → `applyBegriffe`, `planHubLinks` → `runHubLinks`, …).
- **The front matter is the source of truth.** A daily note's folder, file name, tags and term are always derived from `fach`/`projekt`, `datum` and `themen`, never the other way round.
- **Obsidian does the moving.** Files are moved with `fileManager.renameFile`, so links are updated.

## Configuration model

```
SchulSettings
├── bereiche: BereichConfig[]     areas: Schule (period = term), Projekte (period = year)
│   ├── root, property ("fach" | "projekt"), tagPrefix, zeitraum
│   ├── kategorien: Fach[]        { name, folder, tag }
│   ├── hubFolder, generalFolder, noHalbjahrFolder, fileNamePattern
│   ├── tagesnoteTemplate, hubTemplate, kategorieBasePath, themaBasePath
│   └── hubPath                   area hub with the category cards
│                                 (hubFolder/hubTemplate/themaBasePath are only used for pre-0.3 vaults)
├── halbjahre: Halbjahr[]         { name, start, end }, shared by all areas
├── journal, tasks                journal categories, TaskNotes folder and sources
├── tagZuordnung, begriffeAusschluss
├── inboxBasePath, tagBasePath, bereichBasePath
└── kompakt, autoSort, autoCreateHubs
```

`pathConfig(settings, bereich)` merges an area with the shared terms into a `PathConfig`, which is what every path computation uses. `bereichOf(settings, frontmatter)` finds the area of a note from its category property. `mergeSettings` fills new fields from the defaults when older saved settings are loaded.

## Modules (`src/`)

| Module | Kind | Responsibility |
|---|---|---|
| `main.ts` | Obsidian | Plugin entry: commands, ribbon, event handler, creating daily notes, `writeDefaults`, area hubs, base updates |
| `settings.ts` | Obsidian | Settings tab |
| `defaults.ts` | pure | `DEFAULT_SETTINGS`, `pathConfig`, `bereichOf`, `mergeSettings` |
| `config.ts` | pure | Types; parsing subjects and terms; `tagSlug` |
| `paths.ts` | pure | `computeTarget` (folder and file of a daily note), term and year, link parsing, attachment targets |
| `tags.ts` | pure | `deriveTags`: managed tags from subject and topics, others kept |
| `themen.ts` | pure | Topic and subject lists for the dialogs (recently used, counts) |
| `templates.ts` | pure | Built-in templates and all base definitions; `slimBase`, `bereichBase`, `tagBase` |
| `bases.ts` | pure | `pluginBases()`: single source for every base file the plugin owns |
| `bereichhub.ts` | pure | Area hub: embed cards, repair `Name]]` links |
| `hublinks.ts` / `hublinks-apply.ts` | pure / Obsidian | Fold link lists in category hubs into a callout |
| `sort.ts` | Obsidian | `Sorter`: debounced filing on metadata change, tag and term sync, topic hubs, attachments, empty folders |
| `modals.ts` | Obsidian | Subject and topic dialogs, list and text prompts |
| `migration/dates.ts` | pure | Recognising date markers, splitting notes into sections |
| `migration/headings.ts` | pure | Splitting at `#`/`##` headings, merging short parts, anchors per part |
| `migration/links.ts` | pure | Redirecting wikilinks, anchors, Markdown links and canvas nodes to the right part |
| `migration/plan2.ts`, `report2.ts` | pure | Migration v2 plan (parts, names, dates, link map) and report |
| `migration/apply2.ts` | Obsidian | Running migration v2, comparing unresolved links |
| `migration/plan.ts`, `report.ts`, `apply.ts` | pure / Obsidian | Migration v1 (topic hubs); `fixInkPaths` and types are reused by v2 |
| `journal.ts` / `journal-apply.ts` | pure / Obsidian | Journal paths, filing, new notes, scratchpad archive, journal migration |
| `tasks.ts` / `tasks-apply.ts` | pure / Obsidian | Checkboxes ↔ TaskNotes (titles, matching, status sync) |
| `begriffe.ts` / `begriffe-apply.ts` | pure / Obsidian | Glossary terms and people: finding mentions, linking |
| `stichworte.ts` / `stichworte-apply.ts` | pure / Obsidian | Tag normalisation, inline tag rewriting, subtopics from headings |

## Automatic filing

```
metadataCache "changed"
  └─ Sorter.schedule(file)                  debounce 800 ms per file, paused during migrations
       └─ Sorter.sortFile(file)
            ├─ extra hook → Journal.sort    typ: journal → year/month folder, journal tags
            ├─ typ: thema                   pre-0.3 topic hubs: sync tags only
            └─ typ: tagesnote
                 ├─ computeTarget(frontmatter, cfg)   folder from thema (fallback: themen)
                 ├─ deriveTags → processFrontMatter (tags, halbjahr)
                 ├─ syncUnterthemen
                 ├─ name: "<date> <Category>", keep " (n)", next free n if taken (vault-wide)
                 ├─ renameFile → target path, removeEmptyFolders
                 └─ collectAttachments      <Topic>/attachments/* → <Category>/attachments/<Period>/
```

The result is one of `moved | updated | unchanged | skipped | conflict`. A taken name leads to the next free ` (n)`, not to a conflict.

## Bases

All bases the plugin owns come from `pluginBases(settings, dailyFormat)`:

| File | Embedded in | Notes |
|---|---|---|
| `Fach.base` / `Projekt.base` | category hubs | `kategorieBase(property, period)`: all dated notes of the hub's category; filters use `this.file.asLink()` per view (global `this` filters do not work in Bases); the year variant groups by a formula |
| `Bereich.base` | area hubs | Card view per area; formulas for cover image, daily-note count and last date via `file.backlinks` |
| `Journal.base` | journal category hubs | "Archiv" view per category |
| `Tag.base` | daily note template | `date(datum).format(<daily format>) == this.file.name` |
| `Inbox.base` | — | orphaned notes |

Display names of note properties need the `note.` prefix in the `properties:` block. „Templates und Base im Vault anlegen“ only creates missing files. „Base-Dateien auf Plugin-Stand bringen“ overwrites the files that differ from the current definitions.

## Styles

`styles.css` covers two things:
- the dialog rows (`.schul-modal`, `.schul-suggestion`, `.schul-badge`),
- the compact look of embedded bases.

The compact rules apply only when `body.schul-kompakt` is set (a setting) and only to the plugin's own bases. They are matched by the `src` attribute of the embed (`.bases-embed[src^="Fach.base"]`), so notes need no extra classes.
