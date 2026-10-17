# Changelog

## 0.3.0

**One hub per category.** Topic hubs (`_Themen/`) are gone; the topic is the text property `thema`.

- **Migration v2:** every note of a category becomes one or more dated notes.
  - Notes are split at date markers and at `#`/`##` headings (`###` stays inside). Sections under 300 characters are merged into the previous one.
  - Without a date marker the date is estimated from the file (earlier of created/modified) and flagged `datum_geschaetzt: true`.
  - Notes dated before the configured terms, or in folders of an earlier grade (`11/`), are left untouched.
  - Wikilinks, heading and block anchors, embeds, aliases, Markdown links (with or without `.md`) and canvas nodes are redirected to the part that contains the target; aliases move to part 1.
  - Dry run without Obsidian: `node scripts/probelauf2.ts <vault> <report.md>`.
- **Naming:** several notes of a category on the same day are named `<date> <Subject> (2)`, `(3)` …, unique across the vault. The sorter keeps these numbers.
- **Subject/project base:** views Nach Datum, Nach Halbjahr/Jahr, Nach Thema, Nach Kapitel, Unterthemen, Abi-relevant, Datum prüfen, Begriffe; German column names.
- **New note dialog:** the same topic on the same day opens the existing note, a new topic creates another note. "Themen-Hub anlegen" was removed.

## 0.2.0

First public version.

**Daily notes**
- One note per subject per day, filed as `<Area>/<Category>/<Term|Year>/<Topic>/<date> <Category>.md`.
- Tags, term and subtopics are kept in sync, missing topic hubs are created, and empty folders are removed.
- Pasted attachments move to `<Category>/attachments/<Period>/`.

**Areas**
- School subjects (term as period) and projects (year as period) with shared topic hubs.

**Hubs**
- Bases for topic, subject, project and area hubs. Area hubs show one card per subject with its banner, number of notes and last date.

**Interface**
- Two-step dialog with icons and area badges. Recently used subjects come first, and each row shows the number of notes, the last date and the target folder.
- Optional compact styles for the plugin's embedded bases.

**Journal**
- Dated notes in four categories, a permanent scratchpad with an archive button, and a day overview for the Calendar plugin.

**Tasks**
- Checkboxes are linked to TaskNotes, with the status synced both ways.

**Bulk commands** (each with a dry run and confirmation)
- migrate a topic-based vault,
- journal migration,
- unify tags,
- link glossary terms and people,
- replace link lists,
- set up area hubs,
- update base files.

## 0.1.0

Prototype: daily notes per subject, automatic filing, topic and subject bases.
