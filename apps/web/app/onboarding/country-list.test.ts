import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const read = (file: string) =>
  readFileSync(join(__dirname, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const onboarding = read("onboarding.module.css");
const globals = read("../globals.css");

// the declarations of every rule whose selector list names `selector`, media queries included
function declarations(css: string, selector: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.split(",").some((s) => s.trim() === selector))
    .map(([, , body]) => body)
    .join("\n");
}

test("the country list grows with the page instead of scrolling inside it", () => {
  const list = declarations(onboarding, ".countryList");
  expect(list).toContain("display: grid");
  expect(list).not.toMatch(/overflow|max-block-size|max-height/);
});

// The done page and the error page share .actions, so only the question steps add the sticking.
test("the Continue and Skip row sticks to the bottom of the screen on a clean background", () => {
  expect(declarations(onboarding, ".actions")).not.toMatch(/position/);
  const actions = declarations(onboarding, ".questionActions");
  expect(actions).toMatch(/position:\s*sticky/);
  // the bottom of the screen, or the top of the places bar where a screen has one
  expect(actions).toMatch(/inset-block-end:\s*var\(--app-bottom, 0px\)/);
  expect(actions).toMatch(/background:\s*var\(--bg\)/);
  expect(actions).toMatch(/border-block-start:\s*1px solid var\(--line\)/);
  expect(actions).toMatch(/padding:\s*var\(--space-3\) var\(--gutter\)/);
});

// overflow-x: hidden on the body makes it a scroll container that never scrolls, so a
// sticky row inside it never sticks. clip cuts the overflow the same way and does not.
test("the body clips sideways overflow without becoming a scroll container", () => {
  const rule = declarations(globals, "body");
  expect(rule).toMatch(/overflow-x:\s*clip/);
});

// Tabbing to an item near the bottom scrolls it into view. The margin keeps it above the row.
test("items keep clear of the sticky row when the keyboard scrolls them into view", () => {
  for (const selector of [".choice", ".chip"]) {
    expect(declarations(onboarding, selector), selector).toMatch(/scroll-margin-block-end:/);
  }
});
