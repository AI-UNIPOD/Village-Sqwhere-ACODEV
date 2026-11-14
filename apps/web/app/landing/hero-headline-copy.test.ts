import { expect, test } from "vitest";

import { headlineEdit } from "./hero-headline-copy";

// The en dash and the em dash, written as character codes so this file holds no dash itself.
const DASHES = String.fromCharCode(0x2013, 0x2014);

test("the edit copy follows the voice rules: no dashes, no exclamation marks, no emoji", () => {
  for (const edit of Object.values(headlineEdit)) {
    const text = [
      edit.draft,
      edit.underline,
      ...edit.steps.flatMap((step) => [step.name, step.city, step.text]),
    ];
    for (const line of text) {
      expect(line.trim()).not.toBe("");
      expect(line).not.toMatch(new RegExp(`[${DASHES}!]`));
      expect(line).not.toMatch(/\p{Emoji_Presentation}/u);
    }
  }
});

test("the last step of each edit types the full stop, and the first words are words", () => {
  for (const edit of Object.values(headlineEdit)) {
    expect(edit.steps.at(-1)?.text).toBe(".");
    expect(edit.steps.length).toBeGreaterThanOrEqual(2);
    for (const step of edit.steps.slice(0, -1)) expect(step.text).toMatch(/^[\p{L}]+$/u);
  }
});
