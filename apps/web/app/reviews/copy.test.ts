import { expect, test } from "vitest";

import { copy } from "./copy";

// every string in a value, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const shape = (value: unknown): unknown =>
  value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]))
    : "text";

test("English and French say the same things, with no dashes and no exclamation marks", () => {
  expect(shape(copy.fr)).toEqual(shape(copy.en));
  // the en dash and the em dash, as character codes so this file holds no dash itself
  const banned = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}!]`);
  for (const text of strings(copy)) {
    expect(text.trim()).not.toBe("");
    expect(text).not.toMatch(banned);
  }
});

test("each language fills the same slots", () => {
  const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  const en = strings(copy.en);
  const fr = strings(copy.fr);
  expect(fr.map(slots)).toEqual(en.map(slots));
});

test("the tab titles name the screens", () => {
  expect(copy.en.pageTitle).toBe("Peer reviews | Village Sqwhere");
  expect(copy.fr.pageTitle).toBe("Revues par les pairs | Village Sqwhere");
});
