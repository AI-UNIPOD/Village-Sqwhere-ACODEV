import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { SkipLink } from "./skip-link";

afterEach(cleanup);

test.each([
  ["en", "Skip to main content"],
  ["fr", "Aller au contenu principal"],
] as const)("the %s skip link moves focus to the page's main", (lang, label) => {
  render(
    <>
      <SkipLink lang={lang} />
      <nav>
        <button type="button">Somewhere</button>
      </nav>
      <main>
        <h1>Page</h1>
      </main>
    </>,
  );
  fireEvent.click(screen.getByRole("link", { name: label }));
  expect(document.activeElement).toBe(screen.getByRole("main"));
});

test("a page without a main leaves the link harmless", () => {
  render(<SkipLink lang="en" />);
  expect(fireEvent.click(screen.getByRole("link", { name: "Skip to main content" }))).toBe(true);
});
