# Migrating an existing vault

The migration turns a vault organised by topic, with one growing note per topic in subject folders, into the daily-note structure. Every step is a separate command. Each one shows what will change and asks before it runs. **Nothing happens on install.** The automatic filing only touches notes that already carry the plugin's properties.

## Before you start

1. **Dry run without Obsidian.** This only reads the vault and writes a report:
   ```bash
   node scripts/probelauf.ts <vault> report.md            # all areas
   node scripts/probelauf.ts <vault> report.md projekte   # one area
   ```
   Read the warnings and the section on split notes.
2. **Backup.** Copy the whole vault folder and, if the vault is a Git repository, commit and tag it (`git tag before-migration`).
3. **Settings.** Make sure subjects, terms and folders match your vault. A subject name must match its hub file (`<Folder>/<Name>.md`).

## Recommended order

| # | Command | What it does |
|---|---|---|
| 1 | Templates und Base im Vault anlegen | Creates missing templates and bases |
| 2 | Migration ausführen … (once per area, desktop only) | See below |
| 3 | Journal-Migration ausführen … | Unique notes, daily notes and day plans → `05-Journal/<Year>/<Month>/`; the latest scratchpad becomes the permanent one |
| 4 | Aufgaben aus Notizblock, ToDo-Notes und Aufgaben-Quellen … | Open checkboxes → TaskNotes, linked both ways |
| 5 | Tags vereinheitlichen & Unterthemen eintragen … | Inline tags → `stichwort/`, `person/`, `markierung/`; subject-duplicate tags removed; headings → `unterthemen` |
| 6 | Begriffe & Personen verlinken … (optional) | Links the first mention of glossary terms and people |
| 7 | Linklisten in Fach-Hubs durch Base-Ansicht ersetzen … (optional) | Folds hand-written link lists into a callout and adds the "Themen nach Kapitel" view |
| 8 | Bereichs-Hubs einrichten … | Adds the category cards to the area hubs |

Dry-run scripts for steps 6 and 7:
- `node scripts/begriffe-probelauf.ts <vault> report.md`
- `node scripts/hublinks-probelauf.ts <vault> report.md`

## What the migration does (step 2)

- **Category hub** `<Category>/<Category>.md`: gets `typ: fach` (or `projekt`), tags and `![[Fach.base]]` at the end.
- **Every other note** in the category folder:
  - moves to `<Category>/_Themen/`,
  - gets `typ: thema`, the subject link, `kapitel` (its former folder path), tags and `![[Thema.base]]`.
- **Dated sections:** a line that holds only a date (`09-10-2026`, `## 07.10.25`, …) starts a section of the day. Each such section becomes its own daily note (`migriert: true`). Text before the first date stays in the hub.
- **Attachments:**
  - Attachments move to `<Category>/attachments/<former chapter>/`.
  - Canvas files move to `_Themen/`.
  - Ink drawing paths are rewritten.
- **Links:** moves go through Obsidian's file manager, so links are updated. Unresolved links are counted before and after, and the result reports the difference.
- **Left alone:**
  - everything outside the configured categories,
  - Excalidraw and Kanban files,
  - notes inside `attachments/`,
  - notes that already belong to the new structure.

Automatic filing is paused while the migration runs.

## Afterwards

- Compare the number of unresolved links. Only links that were already broken may remain.
- Check `git diff --stat` and spot-check a few subjects.
- Notes that started with a date are now entirely a daily note, and their hub contains only the base. This is intended.

## Undo

Close Obsidian, then either:
- `git reset --hard before-migration && git clean -fd` in the vault, or
- copy the backup back.

The plugin has no built-in undo.
