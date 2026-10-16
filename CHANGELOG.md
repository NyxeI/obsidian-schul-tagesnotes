# Changelog

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
