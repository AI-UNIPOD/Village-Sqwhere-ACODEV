import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const dsDir = join(__dirname, "../../../docs/design-system");
const tokensCss = readFileSync(join(dsDir, "tokens.css"), "utf8");
const tokensJson = JSON.parse(readFileSync(join(dsDir, "tokens.json"), "utf8"));

// the variables declared in the first rule that starts with `selector`
function declared(selector: string): Record<string, string> {
  const start = tokensCss.indexOf(selector);
  const body = tokensCss.slice(tokensCss.indexOf("{", start) + 1, tokensCss.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();

test.each([
  ["light", '[data-theme="light"] {'],
  ["dark", '[data-theme="dark"] {'],
  ["dark", ':root:not([data-theme="light"])'],
])("tokens.css matches tokens.json for the %s theme (%s)", (theme, selector) => {
  const css = declared(selector);
  for (const [job, value] of Object.entries(tokensJson.theme[theme] as Record<string, string>)) {
    expect(norm(css[job] ?? ""), `--${job}`).toBe(norm(value));
  }
});

test("app styles use design system tokens, not raw colours", () => {
  const files = readdirSync(__dirname, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".css"));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const css = readFileSync(join(__dirname, file), "utf8");
    expect(css, file).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  }
});

// css with every `@media (hover: hover) and (pointer: fine) { ... }` block cut out
function withoutHoverBlocks(css: string): string {
  const query = "@media (hover: hover) and (pointer: fine)";
  let rest = css;
  for (let start = rest.indexOf(query); start !== -1; start = rest.indexOf(query)) {
    let end = rest.indexOf("{", start);
    for (let depth = 0; ; end++) {
      if (rest[end] === "{") depth++;
      if (rest[end] === "}" && --depth === 0) break;
    }
    rest = rest.slice(0, start) + rest.slice(end + 1);
  }
  return rest;
}

// A tap on a phone leaves :hover stuck on, so hover styles only apply to a real pointer.
test("app styles keep :hover inside a hover and fine pointer media query", () => {
  const stray = readdirSync(__dirname, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".css"))
    .flatMap((file) => {
      const css = readFileSync(join(__dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      return [...withoutHoverBlocks(css).matchAll(/[^{};]*:hover[^{]*\{/g)].map(
        (m) => `${file}: ${m[0].replace(/\s+/g, " ").trim()}`,
      );
    });
  expect(stray).toEqual([]);
});

test("the app imports the design system tokens", () => {
  const globals = readFileSync(join(__dirname, "globals.css"), "utf8");
  expect(globals).toContain('@import "../../../docs/design-system/tokens.css";');
});
