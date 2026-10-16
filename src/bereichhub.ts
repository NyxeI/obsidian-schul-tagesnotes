// Haupt-Hub eines Bereichs (Schule.md, 04 Projekte.md): Karten-Übersicht einbetten – reine Logik.

/** Zeilen „Name]]“ ohne öffnende Klammern (kaputter Import) → „[[Name]]“. Gibt Inhalt und Anzahl Reparaturen zurück. */
export function repairBrokenLinks(content: string): { content: string; repariert: number } {
  let repariert = 0;
  const out = content.replace(/^([ \t]*(?:[-*+][ \t]+)?)([^\[\]\n]+?)\]\]([ \t]*)$/gm, (_m, pre: string, name: string, post: string) => {
    repariert++;
    return `${pre}[[${name.trim()}]]${post}`;
  });
  return { content: out, repariert };
}

export interface BereichHubPlan {
  /** neuer Inhalt; null = nichts zu tun */
  content: string | null;
  repariert: number;
  eingebettet: boolean;
}

/** Bettet `![[<base>#<view>]]` direkt unter dem Frontmatter ein (einmalig) und repariert kaputte Links. */
export function planBereichHub(content: string, baseName: string, view: string): BereichHubPlan {
  const embed = `![[${baseName}#${view}]]`;
  const fm = /^---\n[\s\S]*?\n---\n/.exec(content)?.[0] ?? "";
  const { content: body, repariert } = repairBrokenLinks(content.slice(fm.length));
  const eingebettet = !content.includes(embed);
  if (!eingebettet && repariert === 0) return { content: null, repariert, eingebettet };
  const neu = eingebettet ? `${fm}## Übersicht\n${embed}\n\n${body.replace(/^\s*\n/, "")}` : fm + body;
  return { content: neu, repariert, eingebettet };
}
