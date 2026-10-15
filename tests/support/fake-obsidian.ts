// Minimale Attrappe der Obsidian-API für Sorter-Tests.
export const notices: string[] = [];

export class Notice {
  constructor(msg: string) {
    notices.push(msg);
  }
}

export function normalizePath(p: string): string {
  return p.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

let currentApp: FakeApp | null = null;

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");

export class TFolder {
  path: string;
  constructor(path: string) {
    this.path = path;
  }
  get children(): (TFile | TFolder)[] {
    return [...currentApp!.files.values()].filter((f) => parentOf(f.path) === this.path);
  }
  get parent(): TFolder | null {
    const f = currentApp!.files.get(parentOf(this.path));
    return f instanceof TFolder ? f : null;
  }
}

export class TFile {
  path: string;
  frontmatter: Record<string, any> | null;
  body: string;
  constructor(path: string, frontmatter: Record<string, any> | null, body = "") {
    this.path = path;
    this.frontmatter = frontmatter;
    this.body = body;
  }
  get basename(): string {
    return this.path.split("/").pop()!.replace(/\.md$/, "");
  }
  get parent(): TFolder | null {
    const f = currentApp!.files.get(parentOf(this.path));
    return f instanceof TFolder ? f : null;
  }
  get extension(): string {
    return this.path.split(".").pop()!;
  }
}

/** Liest das einfache Frontmatter unserer Templates (Skalare, [] und "- x"-Listen). */
export function parseFrontmatter(text: string): Record<string, any> | null {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm: Record<string, any> = {};
  let key = "";
  for (const line of m[1].split("\n")) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && key) {
      (fm[key] ??= []).push(item[1].replace(/^"|"$/g, ""));
      continue;
    }
    if (/^\s+\[\]$/.test(line) && key) {
      fm[key] = [];
      continue;
    }
    const kv = line.match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const v = kv[2].trim();
    fm[key] = v === "" ? null : v === "[]" ? [] : v.replace(/^"|"$/g, "");
  }
  return fm;
}

export class FakeApp {
  files = new Map<string, TFile | TFolder>();
  renames: [string, string][] = [];
  trashed: string[] = [];

  constructor() {
    currentApp = this;
  }

  vault = {
    getAbstractFileByPath: (p: string) => this.files.get(normalizePath(p)) ?? null,
    createFolder: async (p: string) => {
      if (this.files.has(p)) throw new Error(`exists: ${p}`);
      this.files.set(p, new TFolder(p));
    },
    create: async (p: string, content: string) => {
      if (this.files.has(p)) throw new Error(`exists: ${p}`);
      const f = new TFile(p, parseFrontmatter(content), content);
      this.files.set(p, f);
      return f;
    },
    read: async (f: TFile) => f.body,
    getMarkdownFiles: () => [...this.files.values()].filter((f): f is TFile => f instanceof TFile),
  };

  metadataCache = {
    getFileCache: (f: TFile) => (f.frontmatter ? { frontmatter: f.frontmatter } : null),
    getFirstLinkpathDest: (name: string) =>
      this.vault.getMarkdownFiles().find((f) => f.basename === name) ?? null,
  };

  fileManager = {
    trashFile: async (f: TFile | TFolder) => {
      this.files.delete(f.path);
      this.trashed.push(f.path);
    },
    processFrontMatter: async (f: TFile, fn: (fm: any) => void) => {
      f.frontmatter ??= {};
      fn(f.frontmatter);
    },
    renameFile: async (f: TFile, p: string) => {
      const parent = p.split("/").slice(0, -1).join("/");
      if (parent && !(this.files.get(parent) instanceof TFolder)) throw new Error(`no folder: ${parent}`);
      this.files.delete(f.path);
      this.renames.push([f.path, p]);
      f.path = p;
      this.files.set(p, f);
    },
  };

  addNote(path: string, fm: Record<string, any> | null, body = ""): TFile {
    const f = new TFile(path, fm, body);
    this.files.set(path, f);
    return f;
  }
}
