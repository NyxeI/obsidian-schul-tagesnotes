import { type App, TFile, normalizePath } from "obsidian";
import type { SchulSettings } from "./defaults.ts";
import { planHubLinks } from "./hublinks.ts";

export interface HubLinkResult {
  /** umgestellte (bzw. umzustellende) Hubs */
  hubs: string[];
  errors: string[];
}

/** Linklisten der Kategorie-Hubs einklappen und die Ansicht „Themen nach Kapitel“ einbetten. */
export async function runHubLinks(app: App, s: SchulSettings, dryRun: boolean): Promise<HubLinkResult> {
  const res: HubLinkResult = { hubs: [], errors: [] };
  for (const b of s.bereiche) {
    const baseName = b.kategorieBasePath.split("/").pop() ?? b.kategorieBasePath;
    let any = false;
    for (const k of b.kategorien) {
      const f = app.vault.getAbstractFileByPath(normalizePath(`${b.root}/${k.folder}/${k.name}.md`));
      if (!(f instanceof TFile)) continue;
      try {
        if (!planHubLinks(await app.vault.read(f), baseName).content) continue;
        res.hubs.push(f.path);
        any = true;
        if (!dryRun) await app.vault.process(f, (c) => planHubLinks(c, baseName).content ?? c);
      } catch (e) {
        res.errors.push(`${f.path}: ${(e as Error).message}`);
      }
    }
  }
  return res;
}
