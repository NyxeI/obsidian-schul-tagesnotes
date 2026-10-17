# Development

## Setup

```bash
npm install
npm test          # node --test with the TypeScript loader in tests/support/register.ts
npm run build     # type check + production build → main.js
npm run dev       # rebuild on every change
```

Requires Node 24 or newer, which runs TypeScript directly; the tests run without a separate build step.

## Tests

- `tests/*.test.ts` use `node:test`.
- `tests/support/register.ts` maps `import "obsidian"` to `tests/support/fake-obsidian.ts`. That fake provides an in-memory vault, metadata cache (front matter, `resolvedLinks`) and file manager (`renameFile`, `processFrontMatter`, `trashFile`), which is enough to test `Sorter` and the apply steps.
- Modules imported by tests must not use TypeScript parameter properties (`constructor(private x)`), because Node's type stripping does not support them.
- Pure modules (see [ARCHITECTURE.md](ARCHITECTURE.md)) should get unit tests for new behaviour. Obsidian-dependent behaviour is tested against the fake where possible.

## Working against a test vault

Link the repository into a test vault so that each build is picked up:

```bash
ln -s /path/to/obsidian-schul-tagesnotes <test-vault>/.obsidian/plugins/schul-tagesnotes
npm run dev
```

Reload after a build with the Obsidian CLI (enable it under *Settings → General → Advanced*):

```bash
obsidian vault=<name> plugin:reload id=schul-tagesnotes
obsidian vault=<name> dev:errors
obsidian vault=<name> eval code="app.plugins.plugins['schul-tagesnotes'].settings"
```

Use a **copy** of a real vault for testing bulk commands. Never run them on your only copy.

### Demo vault and screenshots

`node scripts/demo-vault.ts <folder> [YYYY-MM-DD]` builds a vault with invented content: four subjects, one project, about 20 dated notes (some with estimated dates), tasks, a scratchpad and a daily note. It copies the current build, so run `npm run build` first. The copy has its own `data.json`; a symlink would share the settings with other test vaults. Set `TASKNOTES_DIR=<folder with TaskNotes main.js/manifest.json/styles.css>` to include TaskNotes.

The README screenshots were taken from this vault with Electron's `capturePage()` via the Obsidian CLI (`eval`). That works without bringing the window to the front. Things to know:
- Call `webContents.setBackgroundThrottling(false)` and `invalidate()` first. Otherwise an occluded window returns a stale frame.
- Disable CSS animations, or modals stay invisible.
- Keep each `eval` under about 2 seconds; wait in the shell instead.

### Known quirks

- `obsidian … base:query` returns results reliably only the first time a base file is queried. For repeated checks, query a fresh copy of the file, or open the note and inspect the rendered DOM (`.bases-embed`, `.bases-cards-item`, `.bases-tr`).
- Bases renders only embeds that are visible. In live preview, scroll the editor to the embed first. A window in the background may not repaint, so screenshots can be stale.
- Long `eval` calls hit the CLI timeout (about 3 seconds). Split them into short steps.
- Do not open another vault through internal IPC (`vault-open`) from a running window. It quit the whole Obsidian app during development; register the vault in `obsidian.json` while Obsidian is closed instead.
- `RangeError: Field is not present in this state` in the console comes from the Ink plugin, not from this plugin.

## Releases (GitHub + BRAT)

Releases are built by GitHub Actions (`.github/workflows/release.yml`) when a version tag is pushed. The tag must equal the version in `manifest.json` and have no `v` prefix; `.npmrc` sets `tag-version-prefix=""`.

```bash
# 1. describe the changes in CHANGELOG.md, commit
# 2. bump the version: updates package.json, manifest.json and versions.json, commits and tags
npm version patch      # or minor / major
# 3. publish
git push --follow-tags
```

The workflow:
1. runs `npm ci`, `npm test` and `npm run build`,
2. checks that the tag matches `manifest.json`,
3. creates a release with `main.js`, `manifest.json` and `styles.css`.

In the vault that uses the plugin, run *BRAT: Check for updates* (or wait for the check at startup).

`versions.json` maps each plugin version to its minimum Obsidian version. Raise `minAppVersion` in `manifest.json` when you use newer API; `version-bump.mjs` copies it into `versions.json`.

### Suggested workflow

- Develop and test in a test vault (symlink + `npm run dev`).
- Commit to `main`; `test.yml` runs the tests on every push.
- When a state is ready for daily use, cut a release with `npm version`. The main vault receives it through BRAT.
