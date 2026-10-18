// Mini-YAML für Tests (Ersatz für Obsidians parseYaml/stringifyYaml): Block-Maps, Block-Listen, einfache Skalare.
// stringify schreibt JSON (gültiges YAML), parse liest beides.

interface Zeile {
  einzug: number;
  text: string;
}

function skalar(s: string): unknown {
  if (s.startsWith('"')) return JSON.parse(s);
  if (s.startsWith("'")) return s.slice(1, -1).replace(/''/g, "'");
  if (s === "true" || s === "false") return s === "true";
  if (s === "null" || s === "~") return null;
  if (s === "[]") return [];
  if (s === "{}") return {};
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

const MAP_ZEILE = /^("[^"]*"|[^\s"'-][^:]*?):(?:\s+(.*))?$/;

export function parseYaml(text: string): unknown {
  const rumpf = text.replace(/^(?:#[^\n]*\n)+/, "").trim();
  if (rumpf.startsWith("{")) return JSON.parse(rumpf);
  const z: Zeile[] = text
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => ({ einzug: l.length - l.trimStart().length, text: l.trim() }));
  let i = 0;
  const istListe = (r: Zeile | undefined) => !!r && (r.text === "-" || r.text.startsWith("- "));

  function block(einzug: number): unknown {
    return istListe(z[i]) ? liste(einzug) : map(einzug);
  }
  function kind(einzug: number): unknown {
    const n = z[i];
    if (n && (n.einzug > einzug || (n.einzug === einzug && istListe(n)))) return block(n.einzug);
    return null;
  }
  function map(einzug: number): Record<string, unknown> {
    const o: Record<string, unknown> = {};
    while (i < z.length && z[i].einzug === einzug && !istListe(z[i])) {
      const m = MAP_ZEILE.exec(z[i++].text);
      if (!m) throw new Error(`YAML: ${z[i - 1].text}`);
      const key = m[1].startsWith('"') ? JSON.parse(m[1]) : m[1];
      o[key] = m[2] !== undefined ? skalar(m[2]) : kind(einzug);
    }
    return o;
  }
  function liste(einzug: number): unknown[] {
    const a: unknown[] = [];
    while (i < z.length && z[i].einzug === einzug && istListe(z[i])) {
      const rest = z[i].text.slice(1).trim();
      if (!rest) {
        i++;
        a.push(kind(einzug));
      } else if (MAP_ZEILE.test(rest)) {
        // "- key: wert" → Map, deren erste Zeile hinter dem Strich steht
        z[i] = { einzug: einzug + 2, text: rest };
        a.push(map(einzug + 2));
      } else {
        i++;
        a.push(skalar(rest));
      }
    }
    return a;
  }
  return z.length ? block(z[0].einzug) : null;
}

export function stringifyYaml(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + "\n";
}
