import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { DoneStep } from "./done-step";
import { NO_ANSWERS } from "./steps";

afterEach(cleanup);

const answers = { ...NO_ANSWERS, role: "frontend-engineer", stack: ["react"] };

function card(lang: "en" | "fr", profile: { displayName: string | null; username: string }) {
  render(<DoneStep lang={lang} answers={answers} profile={profile} onChange={() => {}} />);
}

test("the card shows the real name, with the GitHub username as a link under it", () => {
  card("en", { displayName: "Kofi Mensah", username: "kofi-ships" });
  expect(screen.getByText("Kofi Mensah")).toBeTruthy();
  const link = screen.getByRole("link", { name: "@kofi-ships (GitHub profile, opens in a new tab)" });
  expect(link.getAttribute("href")).toBe("https://github.com/kofi-ships");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});

test("without a real name, the username is the name, shown once and linked", () => {
  card("en", { displayName: null, username: "kofi-ships" });
  expect(screen.getByRole("heading", { level: 1, name: "You're in, kofi-ships." })).toBeTruthy();
  const link = screen.getByRole("link", { name: "kofi-ships (GitHub profile, opens in a new tab)" });
  expect(link.getAttribute("href")).toBe("https://github.com/kofi-ships");
  expect(screen.queryByText(/@kofi-ships/)).toBeNull();
});

test("the link says it opens a new tab in French", () => {
  card("fr", { displayName: "Kofi Mensah", username: "kofi-ships" });
  expect(
    screen.getByRole("link", { name: "@kofi-ships (profil GitHub, s'ouvre dans un nouvel onglet)" }),
  ).toBeTruthy();
});

test("the French card shows technologies in French", () => {
  const stack = ["react", "computer-vision", "llms", "vector-databases"];
  render(
    <DoneStep
      lang="fr"
      answers={{ ...answers, stack }}
      profile={{ displayName: "Kofi Mensah", username: "kofi-ships" }}
      onChange={() => {}}
    />,
  );
  const tags = screen.getAllByRole("listitem").slice(0, stack.length);
  expect(tags.map((tag) => tag.textContent)).toEqual([
    "React",
    "LLM",
    "Vision par ordinateur",
    "Bases de données vectorielles",
  ]);
});
