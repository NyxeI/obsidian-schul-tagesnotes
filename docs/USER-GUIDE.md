# User guide

The plugin's interface is in German. Command names are quoted in German with an English translation in brackets. Paths use the default settings; all of them can be changed under *Settings → Schul-Tagesnotes*.

## Concepts

| Term | Meaning |
|---|---|
| **Area** (*Bereich*) | A top-level folder handled by the plugin, e.g. `01-Schule` (school) or `04-Projekte` (projects). |
| **Category** (*Kategorie*) | A subject (*Fach*) or project inside an area, each with its own folder and **category hub** `<Folder>/<Name>.md`. |
| **Daily note** (*Tagesnote*) | One note per category per day: `<Area>/<Category>/<Period>/<Topic>/<YYYY-MM-DD> <Category>.md`. |
| **Period** (*Zeitraum*) | School: the term (*Halbjahr*, e.g. `13-1`), derived from the date. Projects: the year. |
| **Topic hub** (*Themen-Hub*) | `<Category>/_Themen/<Topic>.md`. Collects all daily notes on that topic. |
| **Area hub** | The overview note of an area (`01-Schule/Schule.md`) with one card per category. |

## Setup

1. **Settings.** Under *Settings → Schul-Tagesnotes*:
   - **Subjects:** one line per subject, `Name | Folder | tag`. The name must match the hub file, e.g. `PuG | Politik und Gesellschaft | politik` for a hub `PuG.md`.
   - **Terms:** one line per term, `Name | Start | End` (YYYY-MM-DD):
     ```
     12-1 | 2025-09-16 | 2026-02-13
     12-2 | 2026-02-14 | 2026-09-07
     ```
   - Folders, file name pattern, templates, bases and the area hub per area.
2. **„Templates und Base im Vault anlegen“** (*create templates and bases*). This creates only missing files:
   - templates for daily notes and topic hubs,
   - `Thema.base`, `Fach.base`, `Projekt.base`, `Bereich.base`, `Journal.base`, `Tag.base` and `Inbox.base`,
   - an embed of the day overview in your daily-note template (for the Calendar plugin).
3. **Hotkeys (recommended).** *Settings → Hotkeys*, e.g.:
   - `Ctrl+Alt+N` for „Neue Tagesnote …“,
   - `Ctrl+Alt+Shift+N` for „Tagesnote heute im Fach der aktuellen Note“,
   - `Ctrl+Alt+J` for „Neue Journal-Note …“.
4. **Category hubs** need `![[Fach.base]]` (projects: `![[Projekt.base]]`). The migration adds it; by hand, add at the end:
   ```markdown
   ## Übersicht
   ![[Fach.base]]
   ```
5. **Area hubs.** Run „Bereichs-Hubs einrichten …“ (*set up area hubs*). It embeds the category cards at the top of `Schule.md` and `04 Projekte.md`.

## Writing during class

1. **„Neue Tagesnote …“** (*new daily note*), from the ribbon icon (calendar with plus), the command palette or your hotkey.
2. **Choose a subject.**
   - Recently used subjects come first.
   - Each row shows the area, the number of daily notes and the date of the last one.
   - Typing filters the list; matches at the start of a word come first.
3. **Choose a topic.**
   - **„Ohne Thema“** (*no topic*): the note goes to `_Allgemein`.
   - **Topics used recently**, with count and last date.
   - **All other notes of the subject**, including old topic notes, most recently edited first.
   - **„Neues Thema: …“** (*new topic*): typing a name that does not exist yet creates the topic and its hub.
   - The target folder is shown on the right, e.g. `→ 13-1/Geraden/`.
4. The note opens in edit mode with the cursor at the end.

| What | Result |
|---|---|
| File | `01-Schule/Mathe/13-1/Geraden/2026-10-15 Mathe.md` |
| Properties | `typ`, `fach`, `datum`, `halbjahr`, `themen` |
| Tags | `schule/mathe`, `mathe/geraden` |
| Topic hub | `01-Schule/Mathe/_Themen/Geraden.md`, created only if no note called "Geraden" exists |

**Special cases**
- **Same subject twice a day:** no second file. The existing note opens and the new topic is appended. The dialog says so beforehand.
- **Note for the subject you are looking at:** „Tagesnote heute im Fach der aktuellen Note“ (*today's note in the current subject*) skips the subject step.
- **Pasted images:** they first land next to the note in `<Topic>/attachments/`. About a second later they move to `<Subject>/attachments/<Term>/` and the link is updated. A file with the same name gets a number.
- **Calendar:** clicking a day in the Calendar plugin opens that day's daily note. Its "Heute" (*today*) section lists all daily notes and journal notes of that date (`Tag.base`).

## Changing topic, date or subject

Edit the properties of the daily note:

```yaml
themen:
  - "[[Ebenen]]"      # the first topic decides the folder
  - "[[Geraden]]"
```

About a second later:
- the note moves to the new folder,
- the tags are updated,
- missing topic hubs are created,
- empty folders are removed.

Changing `datum` updates the term and the file name. Changing `fach` moves the note to another subject. Without any topic the note goes to `_Allgemein`; a date outside all terms goes to `_Ohne Halbjahr`.

> **Do not rename or move daily notes by hand.** Change the properties instead. Otherwise the plugin moves the note back the next time it changes.

## Hubs and views

Switch views with the dropdown at the top left of an embedded base. *Sort*, *Group* and *Filter* in the base toolbar change the `.base` file, so the change applies to **all** hubs.

**Topic hub** (`![[Thema.base]]`):

| View | Content |
|---|---|
| Nach Datum | newest first |
| Nach Halbjahr | grouped by term |
| Nach Themen / Nach Tags | grouped by topic list / tags |
| Älteste zuerst | chronological, good for revision |
| Unterthemen | daily notes with their subtopics |
| Begriffe | glossary terms linked to this topic |

**Subject hub** (`![[Fach.base]]`; projects: `![[Projekt.base]]`):

| View | Content |
|---|---|
| Tagesnotes nach Datum / Halbjahr / Themen / Tags | all daily notes of the subject |
| Themen-Hubs, Themen-Hubs zuletzt geändert | all topic hubs, A–Z or recently edited |
| Themen nach Kapitel | topic hubs grouped by their former folder (`kapitel`) |
| Unterthemen | hubs and daily notes with their subtopics |
| Abi-relevant | everything tagged `#markierung/abi-relevant` |
| Begriffe | glossary terms used in this subject |

**Area hub** (`![[Bereich.base#Schule]]`, `![[Bereich.base#Projekte]]`): one card per category.
- **Image:** the `banner` property, as a URL, `[[image.jpg]]` or a vault path.
- **Text:** the number of daily notes and the date of the last one.
- **Click:** opens the category hub.

**Compact look:** *Settings → Kompakte Hub-Ansichten* (on by default) styles the plugin's embedded bases:
- only the view switcher and the result count stay visible; the other toolbar buttons appear on hover,
- tables have no borders and use compact rows,
- group headings are smaller.

Customise it with your own CSS snippet: every rule is scoped to `body.schul-kompakt` and the embed's `src` attribute (see `styles.css`).

## Commands

| Command (German) | English | What it does |
|---|---|---|
| Neue Tagesnote … | New daily note | Subject → topic → create or open the note |
| Tagesnote heute im Fach der aktuellen Note | Today's note in current subject | As above, subject taken from the open note |
| Aktuelle Note einsortieren | File current note | Fix folder, tags and term of the open note |
| Alle Tagesnotes einsortieren | File all daily notes | Same for the whole vault, with summary |
| Themen-Hub anlegen … | Create topic hub | Subject → name → empty hub |
| Templates und Base im Vault anlegen | Create templates and bases | Creates missing templates and bases |
| Base-Dateien auf Plugin-Stand bringen … | Update base files | Rewrites the plugin's bases to the current version; own edits to those files are lost |
| Bereichs-Hubs einrichten … | Set up area hubs | Embeds the category cards in the area hubs and repairs broken `Name]]` links |
| Migration ausführen … | Run migration | Once per area: topic folders → hubs + daily notes (desktop only) |
| Neue Journal-Note … | New journal note | Category → title → `05-Journal/<Year>/<Month>/` |
| Notizblock archivieren | Archive scratchpad | Link tasks, then store a dated copy of the scratchpad |
| Notizblock-Knopf zur Editing Toolbar hinzufügen | Add scratchpad button | Adds the archive button to the Editing Toolbar plugin |
| Journal-Migration ausführen … | Run journal migration | Unique notes, daily notes, day plans → journal |
| Aufgaben der aktuellen Note mit TaskNotes verlinken | Link tasks of current note | Open checkboxes → TaskNotes, status sync |
| Aufgaben aus Notizblock, ToDo-Notes und Aufgaben-Quellen … | Link all tasks | Same for all task sources, with a dry run |
| Tags vereinheitlichen & Unterthemen eintragen … | Unify tags & subtopics | Inline tags → `stichwort/`, `person/`, `markierung/`; property `unterthemen` |
| Begriffe & Personen verlinken … | Link terms & people | Resource properties; link the first mention of each term |
| Linklisten in Fach-Hubs durch Base-Ansicht ersetzen … | Replace link lists | Folds the old link list into a callout and adds the "Themen nach Kapitel" view |

## Properties

**Daily note:**
```yaml
typ: tagesnote          # required, only these notes are filed
fach: "[[Mathe]]"       # required, link to the subject hub (projects: projekt)
datum: 2026-10-15       # required, YYYY-MM-DD
halbjahr: 13-1          # set automatically from the date (school only)
themen:                 # first topic = folder
  - "[[Geraden]]"
unterthemen: [...]      # set automatically from ## / ### headings
tags:                   # schule/<subject> and <subject>/<topic> are managed; other tags are kept
  - schule/mathe
  - mathe/geraden
```

**Topic hub:** `typ: thema`, `fach`, `tags`; after a migration also `kapitel` (former folder).
**Subject hub:** `typ: fach` (projects: `typ: projekt`), optional `banner` for the card image.
**Journal note:** `typ: journal`, `kategorie: "[[Notiz]]"`, `datum`, `uhrzeit`.

**Managed tags:** `schule/…`, `projekt/…`, `<category>/…` and `journal/…` are rewritten by the plugin. Other tags stay as they are. The suggested scheme for your own tags is:
- `#stichwort/…` for keywords,
- `#person/…` for people,
- `#markierung/…` for markers such as `abi-relevant`.

## Folder layout

```
01-Schule/
├── Schule.md                                   area hub (cards)
├── _Bases/  Fach.base, Thema.base, Bereich.base
└── Mathe/
    ├── Mathe.md                                subject hub
    ├── _Themen/Geraden.md                      topic hubs (flat)
    ├── 13-1/Geraden/2026-10-15 Mathe.md        daily notes
    ├── 13-1/_Allgemein/…                       daily notes without topic
    ├── _Ohne Halbjahr/…                        date outside all terms
    └── attachments/13-1/…                      attachments
04-Projekte/
├── 04 Projekte.md                              area hub
├── _Bases/Projekt.base
└── Meshtastic/2026/LoRa/2026-10-15 Meshtastic.md   project log (period = year)
05-Journal/
├── Notizblock.md, ToDo.md, Notiz.md, Tagesplan.md  category hubs
├── _Bases/Journal.base, Tag.base
└── 2026/2026-10/2026-10-15 1138 Notizblock.md
TaskNotes/Tasks/                                tasks
Inbox.base                                      orphaned notes
```

## Journal, tasks, terms, inbox

- **Journal** (`05-Journal`): dated notes in the categories Notizblock (scratchpad), ToDo, Notiz (note) and Tagesplan (day plan). Each category has a hub with an "Archiv" view. The core plugins *Daily notes* and *Unique note creator* keep working; their notes are not filed automatically.
- **Scratchpad:** `05-Journal/Notizblock.md` is a permanent scratchpad, e.g. pinned in the sidebar. **„Notizblock archivieren“** (*archive scratchpad*):
  1. links its open tasks to TaskNotes,
  2. stores a dated copy in the journal (only if something changed).
- **Tasks:**
  - Every open checkbox in the scratchpad, the to-do notes and the configured task sources becomes a TaskNote. The line gets a link to it.
  - Tags become part of the title: `#wsem` becomes "W-Seminar …".
  - The status syncs in both directions, and running the command again creates no duplicates.
- **Terms & people** (`02-Ressourcen`):
  - Resources get `typ: begriff | person | wissen`.
  - Terms get `themen` and `kategorien`.
  - The first mention in each hub or daily note is linked.
  - Exclusions are set in the settings.
- **Inbox** (`Inbox.base`): "Verwaist" lists notes without any links; "Ohne Backlinks" lists notes nothing links to. Nothing is deleted.
