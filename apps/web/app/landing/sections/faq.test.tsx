import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { Faq } from "./faq";

afterEach(cleanup);

test.each([
  ["en", "Questions, answered plainly.", "Who is Village Sqwhere for?"],
  ["fr", "Vos questions, sans détour.", "À qui s'adresse Village Sqwhere\u202f?"],
] as const)("the %s section names itself and asks six questions", (lang, title, first) => {
  const { container } = render(<Faq lang={lang} />);
  expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
  expect(container.querySelector("section")!.id).toBe("faq");
  const questions = container.querySelectorAll("summary");
  expect(questions).toHaveLength(6);
  expect(questions[0].textContent).toBe(first);
});

test("the pricing question is not shipped", () => {
  render(<Faq lang="en" />);
  expect(screen.queryByText(/cost anything/i)).toBeNull();
});

// The browser closes the rest of a group of details that share a name, with no script. jsdom
// does not do that, so the test checks what the page controls: one name for all six.
test("the six questions are one exclusive group", () => {
  const { container } = render(<Faq lang="en" />);
  const names = Array.from(container.querySelectorAll("details")).map((d) => d.getAttribute("name"));
  expect(names).toEqual(Array(6).fill("faq"));
});

test("a question holds its answer", () => {
  const { container } = render(<Faq lang="en" />);
  const second = container.querySelectorAll("details")[1];
  expect(second.querySelector("summary")!.textContent).toBe("Who can read my idea?");
  expect(second.querySelector("p")!.textContent).toContain("Until you publish");
});
