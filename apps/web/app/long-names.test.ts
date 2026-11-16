import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// The screens a developer lands on after signing in show their GitHub name and username, which
// can be one long word (GitHub allows 39 characters, and a first name can be as long). Without
// a break opportunity the word widens the whole column on a phone and spills out of its card.
// jsdom does no layout, so this reads the rules: each class must be allowed to break anywhere.
const SCREENS: Record<string, string[]> = {
  "onboarding/onboarding.module.css": ["title", "name", "username", "signedIn"],
  "village/village.module.css": ["title", "name", "username"],
};

function breaksAnywhere(css: string, className: string) {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return rules.some(
    ([, selectors, body]) =>
      selectors.split(",").some((selector) => selector.trim() === `.${className}`) &&
      /overflow-wrap:\s*anywhere/.test(body),
  );
}

test.each(Object.entries(SCREENS))("%s lets a long name break inside its word", (file, classes) => {
  const css = readFileSync(join(__dirname, file), "utf8");
  const stuck = classes.filter((name) => !breaksAnywhere(css, name));
  expect(stuck).toEqual([]);
});
