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

// every top-level `@media (prefers-reduced-motion: reduce) { ... }` body, comments cut out
function reducedMotionBlocks(css: string): string[] {
  const query = "@media (prefers-reduced-motion: reduce)";
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: string[] = [];
  for (let start = clean.indexOf(query); start !== -1; start = clean.indexOf(query, start + 1)) {
    const open = clean.indexOf("{", start);
    let end = open;
    for (let depth = 0; ; end++) {
      if (clean[end] === "{") depth++;
      if (clean[end] === "}" && --depth === 0) break;
    }
    blocks.push(clean.slice(open + 1, end));
  }
  return blocks;
}

const appCssFiles = readdirSync(__dirname, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".css"))
  .map((file) => ({
    file: file.replaceAll("\\", "/"),
    css: readFileSync(join(__dirname, file), "utf8"),
  }));

// the selectors of the rules in `css` whose body matches `declaration`
function selectorsWith(css: string, declaration: RegExp): string[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => declaration.test(m[2]))
    .flatMap((m) => m[1].split(",").map((s) => s.replace(/\s+/g, " ").trim()));
}

// A slowed-down press also slows the colour fades. Reduced motion keeps fades and colour
// changes (components.md, Motion), so a block may not squash every transition to nothing.
test("reduced motion keeps colour and opacity transitions", () => {
  const squashed = appCssFiles.flatMap(({ file, css }) =>
    reducedMotionBlocks(css).flatMap((block) =>
      /transition-duration:\s*0\.01ms/.test(block) ? [file] : [],
    ),
  );
  expect(squashed).toEqual([]);
});

// The press feedback is a scale, which is movement. A colour change carries the feedback.
test("reduced motion turns off every :active scale", () => {
  const scaled = appCssFiles.flatMap(({ file, css }) => {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const reduced = reducedMotionBlocks(css).join("\n");
    const off = selectorsWith(reduced, /transform:\s*none/);
    return selectorsWith(clean, /transform:\s*scale\(/)
      .filter((selector) => selector.includes(":active"))
      .filter((selector) => !off.includes(selector))
      .map((selector) => `${file}: ${selector}`);
  });
  expect(scaled).toEqual([]);
});

// Movement that is not a press is not transitioned under reduced motion: the theme icon
// turns without rotating and the link underline appears at once.
test.each([
  ["landing/landing-page.module.css", ".mode svg", "opacity"],
  ["sign-in/sign-in-page.module.css", ".link::after", "border-color"],
])("reduced motion in %s fades %s without moving it", (file, selector, kept) => {
  const css = appCssFiles.find((f) => f.file === file)?.css ?? "";
  const reduced = reducedMotionBlocks(css).join("\n");
  const keepsOnly = new RegExp(String.raw`transition-property:\s*${kept}\s*;`);
  expect(selectorsWith(reduced, keepsOnly)).toContain(selector);
});
