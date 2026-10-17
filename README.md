# Schul-Tagesnotes

An [Obsidian](https://obsidian.md) plugin for **dated notes per subject**. Instead of a single note per topic that keeps growing, you write a fresh dated note for every lesson. The plugin creates the note, files it into `subject / term / topic`, keeps its tags in sync and gives every subject **one hub** with [Bases](https://help.obsidian.md/bases) views over all its notes.

```
01-Schule/<Subject>/<Term>/<Topic>/<YYYY-MM-DD> <Subject>[ (n)].md
```

> The plugin's interface (commands, dialogs, settings) is in **German**, and the defaults fit a German upper school (Bavarian G9, terms `12-1` … `13-2`). Everything, including subjects, terms, folders and templates, can be changed in the settings. Command names below are given in German with a translation.

## Features

- **Dated notes per subject.** Pick a subject, then a topic. The note is created in the right folder with properties and tags already set. The same subject and topic on the same day opens the existing note; another topic on the same day gets a second note `… (2)`.
- **Automatic filing.** If you change `thema` (topic), `datum` (date) or `fach` (subject), the note moves to its new folder about a second later. Tags and term follow, and empty folders are removed.
- **One hub per subject.** There are no separate topic notes; the topic is a property.
  - The subject hub shows all notes by date, term, topic or former chapter, plus subtopics, an "exam-relevant" view and "check dates" for estimated dates.
  - The area hub (e.g. `Schule.md`) shows one card per subject with its banner, number of notes and last lesson.
- **Several areas.** School subjects (with terms) and personal projects (with years as the period) work the same way.
- **Attachments.** Images pasted into a daily note are collected in `<Subject>/attachments/<Term>/` instead of one folder per topic.
- **Journal.** Dated journal notes (scratchpad, to-dos, notes, day plans), a pinned scratchpad with an "archive" button and a day overview for the Calendar plugin.
- **Tasks.** Open checkboxes become [TaskNotes](https://github.com/callumalpass/tasknotes) tasks. The status is synced both ways.
- **Clean-up tools.** Each one shows a dry run before changing anything:
  - migrate an existing topic-based vault: every note becomes dated notes, split at `#`/`##` headings and date markers, with links redirected,
  - unify inline tags (`stichwort/`, `person/`, `markierung/`),
  - link glossary terms and people,
  - replace hand-written link lists with Bases views.
- **Compact look.** Optional styles hide the Bases toolbar clutter and table borders in the plugin's hubs.

## Installation (BRAT)

The plugin is not in the community plugin list. Install it with [BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable **Obsidian42 - BRAT** from the community plugins.
2. *Settings → BRAT → Add Beta plugin* and enter `schildi208-lgtm/obsidian-schul-tagesnotes`.
3. Enable **Schul-Tagesnotes** under *Settings → Community plugins*.

BRAT checks for new releases on startup, or on demand with *BRAT: Check for updates*.

Manual installation: download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest) into `<vault>/.obsidian/plugins/schul-tagesnotes/`.

**Requirements:** Obsidian 1.9 or newer (Bases). Works on desktop and mobile; migrations are desktop-only.

## Quick start

1. *Settings → Schul-Tagesnotes*: check subjects (`Name | Folder | tag`), terms (`Name | Start | End`) and folders.
2. Command palette → **„Templates und Base im Vault anlegen“** (*create templates and bases*). This only creates missing files.
3. Optionally assign a hotkey to **„Neue Tagesnote …“** (*new daily note*), e.g. `Ctrl+Alt+N`.
4. Write: **„Neue Tagesnote …“** → choose a subject → choose or type a topic.

If you already have a vault organised by topic, read [docs/MIGRATION.md](docs/MIGRATION.md) first.

## Documentation

| Document | Content |
|---|---|
| [docs/USER-GUIDE.md](docs/USER-GUIDE.md) | Daily use, hubs and views, all commands, properties, folder layout |
| [docs/MIGRATION.md](docs/MIGRATION.md) | Converting an existing vault step by step, dry runs, backups, undo |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, data flow, configuration model |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Building, testing, local development, releases |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

## Safety

- The plugin never deletes notes; it only removes folders that became empty.
- Notes without the plugin's properties (`typ: tagesnote | thema | journal` plus subject/project) are never touched by the automatic filing.
- Every bulk command (migration, tags, terms, link lists, bases) shows what will change and asks for confirmation. **Make a backup or Git commit first.**

## License

[MIT](LICENSE) © Nyxel
