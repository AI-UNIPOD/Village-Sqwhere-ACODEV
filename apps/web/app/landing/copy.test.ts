import { expect, test } from "vitest";

import { copy } from "./copy";

// every string in a copy object, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

test("English and French have the same shape and no empty text", () => {
  const shape = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(shape)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
        : "text";
  expect(shape(copy.fr)).toEqual(shape(copy.en));
  for (const text of [...strings(copy.en), ...strings(copy.fr)]) expect(text.trim()).not.toBe("");
});

test("the tour stops add up to the total", () => {
  const seconds = (time: string) => {
    const [m, s] = time.split(":").map(Number);
    return m * 60 + s;
  };
  for (const lang of ["en", "fr"] as const) {
    const sum = copy[lang].stops.reduce((n, stop) => n + seconds(stop.time), 0);
    expect(sum).toBe(seconds(copy[lang].total.time));
  }
});

// The en dash and the em dash, written as character codes so this file holds no dash itself.
const DASHES = String.fromCharCode(0x2013, 0x2014);
const EMOJI_SELECTOR = String.fromCharCode(0xfe0f);

test("copy follows the voice rules: no dashes, no exclamation marks, no emoji", () => {
  for (const text of [...strings(copy.en), ...strings(copy.fr)]) {
    expect(text).not.toMatch(new RegExp(`[${DASHES}!]`));
    // Emoji_Presentation catches emoji but not the copyright sign
    expect(text).not.toMatch(/\p{Emoji_Presentation}/u);
    expect(text).not.toContain(EMOJI_SELECTOR);
  }
});
