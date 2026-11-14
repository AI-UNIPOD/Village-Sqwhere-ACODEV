import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { ClosingBand } from "./closing-band";

afterEach(cleanup);

test.each([
  ["en", "Bring your idea to the square.", "Join the village", "Try the demo"],
  ["fr", "Apportez votre idée sur la place.", "Rejoindre le village", "Essayer la démo"],
] as const)("the %s band names itself and offers sign-in and the demo", (lang, title, join, demo) => {
  render(<ClosingBand lang={lang} />);
  expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
  expect(screen.getByRole("link", { name: join }).getAttribute("href")).toBe(`/${lang}/sign-in`);
  expect(screen.getByRole("button", { name: demo }).getAttribute("aria-describedby")).toBe("closing-demo-note");
});

test("what the demo is, and how opening it goes, is told under the buttons", () => {
  render(<ClosingBand lang="en" />);
  expect(document.getElementById("closing-demo-note")!.textContent).toContain("No sign-up");
});
