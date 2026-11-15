import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// CSS modules merge two rules for one class name into one class, so the later rule wins
// for every element that uses it. A top-level rule alone on its selector must be written once.
test("no class in the hubs styles has two top-level rules of its own", () => {
  const css = readFileSync(join(__dirname, "hubs.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const seen = new Map<string, number>();
  for (const [, name] of css.matchAll(/^\.([A-Za-z][\w-]*)\s*\{/gm)) {
    seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  const twice = [...seen].filter(([, count]) => count > 1).map(([name]) => name);
  expect(twice).toEqual([]);
});
