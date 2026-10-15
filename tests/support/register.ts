// Leitet `import … from "obsidian"` in Tests auf eine Attrappe um.
import { registerHooks } from "node:module";

const fake = new URL("./fake-obsidian.ts", import.meta.url).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "obsidian") return { url: fake, shortCircuit: true };
    return next(specifier, context);
  },
});
