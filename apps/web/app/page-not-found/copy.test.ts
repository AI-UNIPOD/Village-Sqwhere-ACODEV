import { expect, test } from "vitest";

import { copy } from "./copy";

// The en dash and the em dash, written as character codes so this file holds no dash itself.
const DASHES = String.fromCharCode(0x2013, 0x2014);
// The narrow no-break space, written as a character code so this file holds no invisible character.
const NARROW_SPACE = String.fromCharCode(0x202f);

// every string of one language, the scene's included
const texts = (lang: "en" | "fr") => Object.values(copy[lang]).flatMap((value) => (typeof value === "string" ? [value] : Object.values(value)));

test("English and French have the same keys and no empty text", () => {
  expect(Object.keys(copy.fr)).toEqual(Object.keys(copy.en));
  expect(Object.keys(copy.fr.stage)).toEqual(Object.keys(copy.en.stage));
  for (const text of [...texts("en"), ...texts("fr")]) expect(text.trim()).not.toBe("");
});

test("copy follows the voice rules: no dashes, no exclamation marks", () => {
  for (const text of [...texts("en"), ...texts("fr")]) {
    expect(text).not.toMatch(new RegExp(`[${DASHES}!]`));
  }
});

test("French puts a narrow no-break space before ? : and ;", () => {
  for (const text of texts("fr")) {
    expect(text).not.toMatch(new RegExp(`(^|[^${NARROW_SPACE}])[?:;]`));
  }
});
