import { expect, test } from "vitest";

import { copy } from "./copy";
import { ROLES, TECHNOLOGIES, TOPICS } from "./options";

// every string in a value, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const shape = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(shape)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
      : "text";

// The en dash and the em dash, written as character codes so this file holds no dash itself.
const DASHES = String.fromCharCode(0x2013, 0x2014);
const words = [copy, ROLES, TOPICS];

test("English and French have the same keys, and every text is filled in", () => {
  expect(shape(copy.fr)).toEqual(shape(copy.en));
  for (const text of strings(words)) expect(text.trim()).not.toBe("");
});

test("copy follows the voice rules: no dashes, no exclamation marks, no space before : or ?", () => {
  for (const text of strings(words)) expect(text).not.toMatch(new RegExp(`[${DASHES}!]`));
  const french = [copy.fr, ROLES.map((role) => role.name.fr), TOPICS.map((topic) => topic.name.fr)];
  for (const text of strings(french)) expect(text).not.toMatch(/\s[:?]/);
});

test("roles and technologies use the slugs the API stores", () => {
  expect(ROLES.map((role) => role.slug)).toEqual([
    "frontend-engineer",
    "backend-engineer",
    "mobile-engineer",
    "ai-ml-engineer",
    "mlops-data-engineer",
    "devops-cloud-engineer",
    "embedded-iot-engineer",
    "security-engineer",
    "ui-ux-engineer",
  ]);
  expect(TECHNOLOGIES.map((tech) => tech.slug).join(" ")).toBe(
    "react vue go rust nodejs python java flutter react-native pytorch tensorflow llms " +
      "computer-vision postgresql vector-databases kubernetes docker terraform ci-cd",
  );
});
