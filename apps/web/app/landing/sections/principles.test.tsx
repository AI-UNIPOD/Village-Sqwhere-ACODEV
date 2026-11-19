import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { Principles } from "./principles";

afterEach(cleanup);

test.each([
  [
    "en",
    "How the village works",
    ["Built together, not hired", "The owner decides, the matcher suggests", "Your brief stays private", "Only verified roles are matched"],
  ],
  [
    "fr",
    "Comment fonctionne le village",
    ["Construire ensemble, pas recruter", "Le porteur de l'idée décide, le matcher propose", "Votre dossier reste privé", "Seuls les rôles vérifiés comptent"],
  ],
] as const)("the %s section names itself and shows four principles", (lang, title, principles) => {
  render(<Principles lang={lang} />);
  expect(screen.getByRole("region", { name: title })).toBeTruthy();
  expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(principles);
});

test("each principle has an icon that is hidden from screen readers", () => {
  const { container } = render(<Principles lang="en" />);
  const icons = container.querySelectorAll("article svg");
  expect(icons).toHaveLength(4);
  icons.forEach((icon) => expect(icon.getAttribute("aria-hidden")).toBe("true"));
});

// jsdom has no layout, so this reads the stylesheet: a phone shows the two principles that no
// other section says, and wider screens all four
test("on a phone only 'built together' and 'your brief stays private' show", () => {
  const { container } = render(<Principles lang="en" />);
  const hidden = Array.from(container.querySelectorAll('article[data-phone="hidden"] h3')).map((h) => h.textContent);
  expect(hidden).toEqual(["The owner decides, the matcher suggests", "Only verified roles are matched"]);
  const css = readFileSync(join(__dirname, "principles.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toContain('@media (max-width: 767px) { .item[data-phone="hidden"] { display: none; } }');
});
