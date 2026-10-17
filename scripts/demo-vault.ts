// Erzeugt einen Demo-Vault mit erfundenen Inhalten (für Screenshots und zum Ausprobieren).
// Aufruf: node scripts/demo-vault.ts <ziel-ordner> [heute=YYYY-MM-DD]
// Das Plugin wird als Kopie des Builds eingebunden (eigene data.json – ein Symlink würde die Einstellungen
// mit anderen Test-Vaults teilen). Vorher `npm run build`. Banner entstehen mit ImageMagick (falls vorhanden).
// Optional: TASKNOTES_DIR=<Ordner mit TaskNotes main.js/manifest.json/styles.css> für das TaskNotes-Widget.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_SETTINGS } from "../src/defaults.ts";
import { parseFaecher } from "../src/config.ts";
import { shiftDate } from "../src/ansicht.ts";
import { pluginBases } from "../src/bases.ts";
import { addTagBaseEmbed, DEFAULT_TAGESNOTE_TEMPLATE } from "../src/templates.ts";

const [ziel, heuteArg] = process.argv.slice(2);
if (!ziel) {
  console.error("Aufruf: node scripts/demo-vault.ts <ziel-ordner> [heute=YYYY-MM-DD]");
  process.exit(1);
}
const vault = resolve(ziel);
const heute = heuteArg ?? new Date().toISOString().slice(0, 10);
const repo = resolve(dirname(new URL(import.meta.url).pathname), "..");

if (existsSync(vault)) rmSync(vault, { recursive: true });
const write = (rel: string, content: string) => {
  const p = join(vault, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
};

// ---------- Einstellungen ----------
const s = structuredClone(DEFAULT_SETTINGS);
const schule = s.bereiche[0];
schule.root = "01-School";
schule.kategorien = parseFaecher(["Math", "Physics", "History", "Literature"].join("\n"));
schule.hubPath = "01-School/School.md";
schule.kategorieBasePath = "01-School/_Bases/Fach.base";
schule.themaBasePath = "01-School/_Bases/Thema.base";
schule.tagesnoteTemplate = "Templates/Daily class note.md";
const projekte = s.bereiche[1];
projekte.root = "04-Projects";
projekte.kategorien = parseFaecher(["Robot Arm"].join("\n"));
projekte.hubPath = "04-Projects/Projects.md";
projekte.kategorieBasePath = "04-Projects/_Bases/Projekt.base";
projekte.themaBasePath = "01-School/_Bases/Thema.base";
projekte.tagesnoteTemplate = "Templates/Project log.md";
s.bereichBasePath = "01-School/_Bases/Bereich.base";
s.journal = { ...s.journal, root: "05-Journal", notizblockPath: "05-Journal/Notizblock.md", basePath: "05-Journal/_Bases/Journal.base" };
s.tagBasePath = "05-Journal/_Bases/Tag.base";
s.tasks = { ...s.tasks, folder: "Tasks", quellen: [] };
s.inboxBasePath = "Inbox.base";

// ---------- .obsidian ----------
write(".obsidian/app.json", JSON.stringify({ attachmentFolderPath: "./attachments", alwaysUpdateLinks: true, showInlineTitle: true }, null, 2));
write(".obsidian/appearance.json", JSON.stringify({ theme: "obsidian", baseFontSize: 15 }, null, 2));
write(
  ".obsidian/core-plugins.json",
  JSON.stringify({ "file-explorer": true, "global-search": true, switcher: true, "page-preview": true, "daily-notes": true, templates: true, "command-palette": true, properties: true, bases: true, outline: true, "tag-pane": true, backlink: true }, null, 2),
);
write(".obsidian/daily-notes.json", JSON.stringify({ format: "YYYY-MM-DD", folder: "Daily", template: "Templates/Daily note" }, null, 2));
const plugins = ["schul-tagesnotes"];
const tasknotes = process.env.TASKNOTES_DIR;
if (tasknotes && existsSync(tasknotes)) plugins.push("tasknotes");
write(".obsidian/community-plugins.json", JSON.stringify(plugins, null, 2));
const pluginDir = join(vault, ".obsidian/plugins/schul-tagesnotes");
mkdirSync(pluginDir, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(repo, f), join(pluginDir, f));
if (plugins.includes("tasknotes")) {
  // TaskNotes (fremdes Plugin) nur lokal hineinkopieren – nicht Teil des Repos
  mkdirSync(join(vault, ".obsidian/plugins/tasknotes"), { recursive: true });
  for (const f of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(tasknotes!, f), join(vault, ".obsidian/plugins/tasknotes", f));
}

// ---------- Banner ----------
const banner = (name: string, a: string, b: string) => {
  const p = join(vault, "Banner", `${name}.png`);
  mkdirSync(dirname(p), { recursive: true });
  try {
    execFileSync("magick", ["-size", "1200x400", `gradient:${a}-${b}`, p]);
    return `"[[${name}.png]]"`;
  } catch {
    return null;
  }
};

// ---------- Hubs ----------
const hubs: [string, string, string, string][] = [
  ["Math", "#4cc9f0", "#4361ee", "Linear algebra, analysis and probability for the final exam."],
  ["Physics", "#f72585", "#7209b7", "Optics, oscillations and electric fields."],
  ["History", "#ffb703", "#fb8500", "From the Weimar Republic to the Cold War."],
  ["Literature", "#06d6a0", "#118ab2", "Drama, poetry and essay writing."],
];
for (const [name, a, b, text] of hubs) {
  const bn = banner(name, a, b);
  write(
    `01-School/${name}/${name}.md`,
    `---\n${bn ? `banner: ${bn}\n` : ""}typ: fach\ntags:\n  - schule/${name.toLowerCase()}\n---\n## Themen\n![[Fach.base#Nach Thema]]\n\n${text}\n\n## Übersicht\n![[Fach.base]]\n`,
  );
}
write("01-School/School.md", `## Übersicht\n![[Bereich.base#Schule]]\n\nWelcome to the demo vault of **Schul-Tagesnotes**. Every subject has exactly one hub; every lesson is a dated note.\n`);
const rb = banner("Robot Arm", "#8338ec", "#3a86ff");
write("04-Projects/Robot Arm/Robot Arm.md", `---\n${rb ? `banner: ${rb}\n` : ""}typ: projekt\ntags:\n  - projekt/robot-arm\n---\n## Log\n![[Projekt.base]]\n`);
write("04-Projects/Projects.md", `## Übersicht\n![[Bereich.base#Projekte]]\n`);

// ---------- Datierte Notes ----------
type Spec = { fach: string; tage: number; thema: string; abschnitt?: string; geschaetzt?: boolean; text: string };
const specs: Spec[] = [
  { fach: "Math", tage: 0, thema: "Vectors", text: "## Scalar product\n\n$\\vec a \\cdot \\vec b = |\\vec a|\\,|\\vec b| \\cos\\varphi$\n\n- orthogonal ⇔ product = 0\n- angle between two lines\n\n### Exercise\nCompute the angle between (1,2,2) and (2,1,−2)." },
  { fach: "Math", tage: 0, thema: "Probability", text: "## Binomial distribution\n\nB(n; p; k) = C(n,k) · p^k · (1−p)^(n−k)\n\n- expected value μ = n·p\n- standard deviation σ = √(n·p·(1−p))" },
  { fach: "Math", tage: -7, thema: "Vectors", text: "## Lines in space\n\nParametric form: x = a + t·u\n\n### Point test\nInsert the point and solve for t." },
  { fach: "Math", tage: -14, thema: "Vectors", text: "## Planes\n\nNormal form and coordinate form; converting between them." },
  { fach: "Math", tage: -150, thema: "Integrals", abschnitt: "Antiderivatives", geschaetzt: true, text: "# Antiderivatives\n\nRules: power rule, sum rule, constant factor." },
  { fach: "Math", tage: -150, thema: "Integrals", abschnitt: "Area under a curve", geschaetzt: true, text: "## Area under a curve\n\nThe definite integral measures the signed area." },
  { fach: "Math", tage: -150, thema: "Integrals", abschnitt: "Volume of revolution", geschaetzt: true, text: "## Volume of revolution\n\nV = π ∫ f(x)² dx" },
  { fach: "Physics", tage: -1, thema: "Optics", text: "## Lens equation\n\n1/f = 1/g + 1/b\n\n- converging lens: f > 0\n- diverging lens: f < 0" },
  { fach: "Physics", tage: -8, thema: "Optics", text: "## The human eye\n\nAccommodation changes the focal length of the lens." },
  { fach: "Physics", tage: -30, thema: "Oscillations", text: "## Pendulum\n\nT = 2π √(l/g)" },
  { fach: "Physics", tage: -200, thema: "Electric fields", abschnitt: "Field lines", geschaetzt: true, text: "## Field lines\n\nThey start at positive and end at negative charges." },
  { fach: "History", tage: -2, thema: "Weimar Republic", text: "## Crises of 1923\n\n- hyperinflation\n- occupation of the Ruhr\n- Hitler putsch" },
  { fach: "History", tage: -9, thema: "Weimar Republic", text: "## Constitution\n\nArticle 48 and the role of the president." },
  { fach: "History", tage: -60, thema: "Cold War", abschnitt: "Berlin blockade", geschaetzt: true, text: "## Berlin blockade 1948/49\n\nAirlift and the division of Germany." },
  { fach: "Literature", tage: -3, thema: "Woyzeck", text: "## The doctor as aggressor\n\nScene analysis: language, power, dehumanisation.\n\n#markierung/abi-relevant" },
  { fach: "Literature", tage: -3, thema: "Poetry analysis", text: "## Structure of an analysis\n\n1. Introduction\n2. Form and content\n3. Interpretation" },
  { fach: "Literature", tage: -100, thema: "Woyzeck", abschnitt: "The captain", geschaetzt: true, text: "## The captain\n\nMorality as a privilege of the rich." },
];
const halbjahr = (d: string) => s.halbjahre.find((h) => h.start <= d && d <= h.end)?.name ?? "_Ohne Halbjahr";
const zaehler = new Map<string, number>();
const gruppen = new Map<string, Spec[]>();
for (const sp of specs) gruppen.set(`${sp.fach}|${sp.thema}|${sp.tage}`, [...(gruppen.get(`${sp.fach}|${sp.thema}|${sp.tage}`) ?? []), sp]);
for (const sp of specs) {
  const datum = shiftDate(heute, sp.tage);
  const key = `${sp.fach}|${datum}`;
  const n = (zaehler.get(key) ?? 0) + 1;
  zaehler.set(key, n);
  const name = `${datum} ${sp.fach}${n > 1 ? ` (${n})` : ""}`;
  const gruppe = gruppen.get(`${sp.fach}|${sp.thema}|${sp.tage}`)!;
  const teil = sp.abschnitt && gruppe.length > 1 ? `teil: ${gruppe.indexOf(sp) + 1}/${gruppe.length}\n` : "";
  const fm =
    `---\ntyp: tagesnote\nfach: "[[${sp.fach}]]"\ndatum: ${datum}\nhalbjahr: ${halbjahr(datum)}\nthema: ${sp.thema}\n` +
    (sp.abschnitt ? `abschnitt: ${sp.abschnitt}\n${teil}quelle: 01-School/${sp.fach}/${sp.thema}.md\n` : "") +
    (sp.geschaetzt ? "datum_geschaetzt: true\n" : "") +
    `tags:\n  - schule/${sp.fach.toLowerCase()}\n  - ${sp.fach.toLowerCase()}/${sp.thema.toLowerCase().replace(/ /g, "-")}\n---\n`;
  write(`01-School/${sp.fach}/${halbjahr(datum)}/${sp.thema}/${name}.md`, fm + sp.text + "\n");
}
write(
  `04-Projects/Robot Arm/${heute.slice(0, 4)}/Servos/${shiftDate(heute, -4)} Robot Arm.md`,
  `---\ntyp: tagesnote\nprojekt: "[[Robot Arm]]"\ndatum: ${shiftDate(heute, -4)}\nthema: Servos\ntags:\n  - projekt/robot-arm\n  - robot-arm/servos\n---\n## Calibrating the servos\n\nPWM range 500–2500 µs.\n`,
);

// ---------- Bases, Templates, Daily Note, Journal, Aufgaben ----------
for (const [path, content] of pluginBases(s, "YYYY-MM-DD")) write(path, content);
write("Templates/Daily class note.md", DEFAULT_TAGESNOTE_TEMPLATE.replace(/\{\{property\}\}/g, "fach"));
write("Templates/Project log.md", DEFAULT_TAGESNOTE_TEMPLATE.replace(/\{\{property\}\}/g, "projekt").replace(/^halbjahr:.*\n/m, ""));
write("Templates/Daily note.md", addTagBaseEmbed("", "Tag.base"));
write(`Daily/${heute}.md`, `Plans for today: revise vectors, lab report.\n\n## Heute\n![[Tag.base]]\n`);
write(
  "05-Journal/Notizblock.md",
  "---\ntyp: journal-kategorie\n---\n- [ ] Math: finish exercise sheet 4\n- [ ] Physics: bring the lab report\n- [x] Library books returned\n\nQuick thoughts go here.\n\n## Archiv\n![[Journal.base#Archiv]]\n",
);
const task = (titel: string, fach: string, tage: number) =>
  write(`Tasks/${titel}.md`, `---\ntitle: ${titel}\nstatus: open\npriority: normal\ndue: ${shiftDate(heute, tage)}\nprojects:\n  - "[[${fach}]]"\ntags:\n  - task\n---\n`);
task("Math exercise sheet 4", "Math", 2);
task("Math revise vectors", "Math", 6);
task("Physics lab report", "Physics", 1);

writeFileSync(join(pluginDir, "data.json"), JSON.stringify(s, null, 2));
console.log(JSON.stringify({ vault, heute, notes: specs.length + 1, plugins }));
