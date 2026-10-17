// Linklisten in Kategorie-Hubs (Fach-Hubs) durch eine Base-Ansicht ersetzen – reine Logik.
// Nichts geht verloren: die alte Liste wandert in einen eingeklappten Callout, die Links (und Backlinks) bleiben.

export const KAPITEL_VIEW = "Nach Thema";
export const ALTE_LISTE_TITEL = "Alte Linkliste (vor der Umstellung)";

export interface HubLinkPlan {
  /** neuer Inhalt; null = nichts zu tun */
  content: string | null;
  /** Grund, falls nichts geändert wird */
  grund?: string;
  /** Wiki-Links in der alten Liste (Ziel ohne Alias/Abschnitt) */
  links: string[];
  /** Zeilen, die eingeklappt werden */
  zeilen: number;
}

const LINK = /(?<!!)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

/** Ist der Bereich eine Linkliste? Mindestens 60 % der Inhaltszeilen enthalten einen Wiki-Link (keine Einbettung). */
export function isLinkList(lines: string[]): boolean {
  const inhalt = lines.filter((l) => l.trim() && !/^\s*(-{3,}|\*{3,}|#{1,6}\s.*)\s*$/.test(l));
  if (inhalt.length === 0) return false;
  const mitLink = inhalt.filter((l) => new RegExp(LINK.source).test(l));
  return mitLink.length >= 2 && mitLink.length / inhalt.length >= 0.6;
}

/**
 * Plant die Umstellung eines Kategorie-Hubs: Bereich zwischen Frontmatter und der Base-Einbettung
 * (bzw. der Überschrift davor) wird zum eingeklappten Callout, darüber kommt die Ansicht „Themen nach Kapitel“.
 */
export function planHubLinks(content: string, baseName: string): HubLinkPlan {
  const fm = /^---\n[\s\S]*?\n---\n/.exec(content)?.[0] ?? "";
  const body = content.slice(fm.length);
  if (body.includes(`![[${baseName}#${KAPITEL_VIEW}]]`) || body.includes(ALTE_LISTE_TITEL)) {
    return { content: null, grund: "schon umgestellt", links: [], zeilen: 0 };
  }
  const lines = body.split("\n");
  const embedIdx = lines.findIndex((l) => l.includes(`![[${baseName}`));
  if (embedIdx < 0) return { content: null, grund: `keine Einbettung ![[${baseName}]]`, links: [], zeilen: 0 };
  // Überschrift direkt vor der Einbettung (z. B. "## Übersicht") gehört zur Base
  let end = embedIdx;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  if (end > 0 && /^#{1,6}\s/.test(lines[end - 1])) end--;
  let start = 0;
  while (start < end && lines[start].trim() === "") start++;
  let stop = end;
  while (stop > start && lines[stop - 1].trim() === "") stop--;
  const alt = lines.slice(start, stop);
  const links = [...new Set(alt.flatMap((l) => [...l.matchAll(LINK)].map((m) => m[1].trim())))];
  if (!isLinkList(alt)) return { content: null, grund: alt.length ? "keine reine Linkliste (eigener Inhalt)" : "keine Liste", links, zeilen: 0 };
  const callout = [`> [!abstract]- ${ALTE_LISTE_TITEL}`, ...alt.map((l) => (l.trim() ? `> ${l}` : ">"))];
  const neu = [
    "## Themen",
    `![[${baseName}#${KAPITEL_VIEW}]]`,
    "",
    ...callout,
    "",
    ...lines.slice(end),
  ].join("\n");
  return { content: fm + neu, links, zeilen: alt.length };
}
