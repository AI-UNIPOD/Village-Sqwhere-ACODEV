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
