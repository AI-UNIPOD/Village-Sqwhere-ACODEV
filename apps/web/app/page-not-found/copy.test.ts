import { expect, test } from "vitest";

import { copy } from "./copy";

// The en dash and the em dash, written as character codes so this file holds no dash itself.
const DASHES = String.fromCharCode(0x2013, 0x2014);
// The narrow no-break space, written as a character code so this file holds no invisible character.
const NARROW_SPACE = String.fromCharCode(0x202f);

test("English and French have the same keys and no empty text", () => {
  expect(Object.keys(copy.fr)).toEqual(Object.keys(copy.en));
  for (const text of [...Object.values(copy.en), ...Object.values(copy.fr)]) expect(text.trim()).not.toBe("");
});

test("copy follows the voice rules: no dashes, no exclamation marks", () => {
  for (const text of [...Object.values(copy.en), ...Object.values(copy.fr)]) {
    expect(text).not.toMatch(new RegExp(`[${DASHES}!]`));
  }
});

test("French puts a narrow no-break space before ? : and ;", () => {
  for (const text of Object.values(copy.fr)) {
    expect(text).not.toMatch(new RegExp(`(^|[^${NARROW_SPACE}])[?:;]`));
  }
});
