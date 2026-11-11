import { expect, test } from "vitest";

import { copy } from "./copy";

// every string in a copy object, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

test("English and French have the same keys and no empty text", () => {
  const keys = (value: object): unknown =>
    Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeof v === "object" ? keys(v) : "text"]));
  expect(keys(copy.fr)).toEqual(keys(copy.en));
  for (const text of [...strings(copy.en), ...strings(copy.fr)]) expect(text.trim()).not.toBe("");
});

// The en dash and the em dash, written as character codes so this file holds no dash itself.
const DASHES = String.fromCharCode(0x2013, 0x2014);

test("copy has no dashes and no exclamation marks", () => {
  for (const text of [...strings(copy.en), ...strings(copy.fr)]) {
    expect(text).not.toMatch(new RegExp(`[${DASHES}!]`));
  }
});
