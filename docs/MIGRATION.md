# Migrating an existing vault

The migration turns a vault organised by topic, with one growing note per topic in subject folders, into dated notes with one hub per subject. Every step is a separate command. Each one shows what will change and asks before it runs. **Nothing happens on install.** The automatic filing only touches notes that already carry the plugin's properties.

## Before you start

1. **Dry run without Obsidian.** This only reads the vault and writes a report:
   ```bash
   node scripts/probelauf2.ts <vault> report.md                 # all areas
   node scripts/probelauf2.ts <vault> report.md projekte        # one area
   node scripts/probelauf2.ts <vault> report.md --min=400       # coarser split
   ```
   The report lists every old note with its new parts (date, ≈ estimated, heading, size), the redirected links, warnings and the notes left untouched.
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

- **Category hub** `<Category>/<Category>.md`: gets `typ: fach` (or `projekt`), tags and `![[Fach.base]]` at the end. It is the only hub; there are no topic hubs.
- **Every other note** in the category folder becomes one or more **dated notes**:
  - It is split at date markers: a line that holds only a date (`09-10-2026`, `## 07.10.25`, …) starts the section of that day.
  - The rest is split at `#` and `##` headings. `###` and deeper stay inside a part. Parts shorter than 300 characters are merged into the previous part.
  - Parts with a date marker get that date. All other parts get the file date, i.e. the earlier of created and modified, and are flagged `datum_geschaetzt: true` (view "Datum prüfen").
  - Each part lands in `<Category>/<Term>/<Topic>/<date> <Category>[ (n)].md` with `thema` (the old note name), `abschnitt`, `teil`, `kapitel` (old folder) and `quelle` (old path). Aliases and other properties of the old note go to part 1.
- **Earlier grades are left alone** (areas with terms only). A note stays where it is when it lies in a folder like `11/` or `11. Klasse`, or when neither its file date nor any of its date markers falls into a configured term. Attachments in its folder stay as well.
- **Links:** before anything moves, every link to an old note is redirected to the part that contains the target. This covers wikilinks, embeds, `#heading` and `#^block` anchors, Markdown links with or without `.md`, and canvas nodes. The visible text stays the same: `[[Woyzeck#Doktor]]` becomes `[[2026-06-22 Deutsch (3)#Doktor|Woyzeck > Doktor]]`. Links in tables (`\|`) keep their escaping.
- **Attachments** (images, PDFs, canvas, Ink) move to `<Category>/attachments/<old folder>/`; Obsidian updates the links, and Ink paths are rewritten.
- **Old notes** go to the trash only after all their parts exist. Empty folders are removed.
- **Left alone:** everything outside the configured categories, Excalidraw and Kanban files, notes inside `attachments/` and notes that already are dated notes.

Automatic filing is paused while the migration runs. At the end the plugin compares unresolved links before and after. Links that were already dead before can show up as "new" under the new note names.

## Afterwards

- Compare the number of unresolved links. Only links that were already broken may remain.
- Check `git diff --stat` and spot-check a few subjects.
- Check the view "Datum prüfen" in each subject hub and correct estimated dates where you know better; the sorter then moves the note.

## Undo

Close Obsidian, then either:
- `git reset --hard before-migration && git clean -fd` in the vault, or
- copy the backup back.

The plugin has no built-in undo.

> **Before running the migration again after a `git reset`:** Git writes restored files with the current time, so every estimated date would become "today". Copy the backup back instead (`cp -a` keeps the times), or restore the modification times from an untouched copy, e.g. `touch -r <original>/<file> <vault>/<file>` for every file with identical content.
