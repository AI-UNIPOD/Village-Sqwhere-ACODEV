import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const css = readFileSync(join(__dirname, "onboarding.module.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

// the text between the braces of the `{` at `open`
function block(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

// the declarations of the first rule in `text` whose line starts with `selector {`
function rule(text: string, selector: string): string {
  const needle = `${selector} {`;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    if (text.slice(text.lastIndexOf("\n", at) + 1, at).trim() === "") {
      return block(text, at + needle.length - 1);
    }
  }
  return "";
}

const reducedMotion = block(
  css,
  css.indexOf("{", css.indexOf("@media (prefers-reduced-motion: reduce)")),
);

test("a pressed role or country card scales to 0.97 like the chips and Back", () => {
  expect(rule(css, ".choice:active")).toMatch(/transform:\s*scale\(0\.97\)/);
  expect(rule(css, ".choice")).toMatch(/transform var\(--dur-press\)/);
});

test("the card press does not move anything under reduced motion", () => {
  expect(rule(reducedMotion, ".choice:active")).toMatch(/transform:\s*none/);
});
