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

const appFiles = (extension: RegExp) =>
  readdirSync(__dirname, { recursive: true })
    .map(String)
    .filter((f) => extension.test(f) && !f.includes(".test."));

// every colour notation a stylesheet or a script could use instead of a token
const RAW_COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

test("app styles use design system tokens, not raw colours", () => {
  const files = appFiles(/\.css$/);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const css = readFileSync(join(__dirname, file), "utf8");
    expect(css, file).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css, file).not.toMatch(RAW_COLOUR_FUNCTION);
  }
});

test("app scripts use design system tokens too: no quoted hex, colour function or named fill", () => {
  const files = appFiles(/\.tsx?$/);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const code = readFileSync(join(__dirname, file), "utf8");
    expect(code, file).not.toMatch(/["'`]#[0-9a-f]{3,8}["'`]/i);
    expect(code, file).not.toMatch(RAW_COLOUR_FUNCTION);
    expect(code, file).not.toMatch(/\b(?:fill|stroke|color|background(?:Color)?)\s*[=:]\s*["'](?:white|black|red|blue|green|gray|grey)\b/i);
  }
});

test("every var(--name) in the app styles is declared somewhere", () => {
  const known = new Set<string>([...tokensCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const file of appFiles(/\.(?:css|tsx?)$/)) {
    for (const m of readFileSync(join(__dirname, file), "utf8").matchAll(/["'\s{;](--[\w-]+)\s*[:"']/g)) known.add(m[1]);
  }
  for (const file of appFiles(/\.css$/)) {
    const css = readFileSync(join(__dirname, file), "utf8");
    for (const m of css.matchAll(/var\((--[\w-]+)/g)) expect(known.has(m[1]), `${file}: ${m[1]}`).toBe(true);
  }
});
