// Banner datierter Notes (pure): eigenes Banner, sonst das der früheren Themen-Note (quelle), sonst das des Fach-Hubs.
import type { PathConfig } from "./config.ts";
import { findFach, linkTarget } from "./paths.ts";
import type { NoteInfo } from "./themen.ts";

/** Banner-Wert als Text (Obsidian liefert ihn als String; leere Werte zählen nicht). */
export function bannerWert(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** Banner für eine Note: eigenes, sonst das der früheren Note, sonst (falls erlaubt) das des Fach-Hubs. */
export function bannerFuer(eigen: unknown, quelleBanner: string | null, hubBanner: string | null, fachFallback: boolean): string | null {
  return bannerWert(eigen) ?? quelleBanner ?? (fachFallback ? hubBanner : null);
}

export interface BannerEintrag {
  path: string;
  banner: string;
  herkunft: "quelle" | "hub";
}

/**
 * Datierte Notes eines Bereichs ohne Banner, die eins bekommen sollen.
 * Die Banner früherer Notes kommen von Geschwister-Teilen mit derselben `quelle`, die eins tragen.
 */
export function planBanner(notes: NoteInfo[], cfg: PathConfig, hubBanner: (fach: string) => string | null, fachFallback: boolean): BannerEintrag[] {
  const ausQuelle = new Map<string, string>();
  for (const n of notes) {
    const q = n.fm?.quelle;
    const b = bannerWert(n.fm?.banner);
    if (n.fm?.typ === "tagesnote" && typeof q === "string" && b && !ausQuelle.has(q)) ausQuelle.set(q, b);
  }
  const out: BannerEintrag[] = [];
  for (const n of notes) {
    const fm = n.fm ?? {};
    if (fm.typ !== "tagesnote" || bannerWert(fm.banner)) continue;
    const fach = findFach(linkTarget(fm[cfg.property]), cfg.kategorien);
    if (!fach) continue;
    const q = typeof fm.quelle === "string" ? ausQuelle.get(fm.quelle) ?? null : null;
    const banner = bannerFuer(null, q, hubBanner(fach.name), fachFallback);
    if (banner) out.push({ path: n.path, banner, herkunft: q ? "quelle" : "hub" });
  }
  return out;
}
