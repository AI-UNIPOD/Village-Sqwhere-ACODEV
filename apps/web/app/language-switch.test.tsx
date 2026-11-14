import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { LanguageSwitch } from "./language-switch";

afterEach(cleanup);

test("names the page's language and links to the other one, on the same screen", () => {
  const { container } = render(<LanguageSwitch lang="en" path="hubs/view?id=7" />);
  const group = container.querySelector<HTMLElement>("[data-language-switch]")!;
  expect(within(group).getByText("English").closest("[aria-current]")).toBeTruthy();
  const link = within(group).getByRole("link", { name: "Français" });
  expect(link.getAttribute("href")).toBe("/fr/hubs/view?id=7");
  expect(link.getAttribute("hreflang")).toBe("fr");
  expect(group.getAttribute("translate")).toBe("no");
});

test("on the French landing page it links to the English landing page", () => {
  render(<LanguageSwitch lang="fr" path="" />);
  expect(screen.getByText("Français").closest("[aria-current]")).toBeTruthy();
  expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/en");
});

test("a press slides the thumb across, and a press that opens a new tab does not", () => {
  const { container } = render(<LanguageSwitch lang="en" path="" />);
  const group = container.querySelector<HTMLElement>("[data-language-switch]")!;
  const link = within(group).getByRole("link");
  link.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(link, { ctrlKey: true });
  expect(group.hasAttribute("data-going")).toBe(false);
  fireEvent.click(link);
  expect(group.hasAttribute("data-going")).toBe(true);
});
