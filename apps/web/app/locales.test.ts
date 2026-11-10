import { expect, test } from "vitest";

import { hasLocale, pickLocale } from "./locales";

test.each([
  [null, "en"],
  ["", "en"],
  ["fr", "fr"],
  ["fr-CA,fr;q=0.9,en;q=0.8", "fr"],
  ["en-US,en;q=0.9,fr;q=0.8", "en"],
  ["de,fr;q=0.7,en;q=0.3", "fr"],
  ["de,es;q=0.9", "en"],
  ["fr;q=0", "en"],
  ["*", "en"],
])("picks the language for Accept-Language %j", (header, expected) => {
  expect(pickLocale(header)).toBe(expected);
});

test("knows which locales the site supports", () => {
  expect(hasLocale("en")).toBe(true);
  expect(hasLocale("fr")).toBe(true);
  expect(hasLocale("de")).toBe(false);
  expect(hasLocale("")).toBe(false);
});
