import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import LangError from "../[lang]/error";

const route = vi.hoisted(() => ({ lang: "en" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ lang: route.lang }) }));

afterEach(cleanup);

test.each([
  [
    "en",
    "We couldn't show this page",
    "Something went wrong on our side. Nothing was lost. Try again, or come back in a few minutes.",
    "Try again",
    "Back to the home page",
  ],
  [
    "fr",
    "Nous n'avons pas pu afficher cette page",
    "Un problème est survenu de notre côté. Rien n'a été perdu. Réessayez, ou revenez dans quelques minutes.",
    "Réessayer",
    "Retour à l'accueil",
  ],
])("the %s error page says what happened, that nothing was lost and what to do", (lang, heading, text, retry, home) => {
  route.lang = lang;
  render(<LangError retry={vi.fn()} />);
  const main = screen.getByRole("main");
  expect(within(main).getByRole("heading", { level: 1, name: heading })).toBeTruthy();
  expect(within(main).getByText(text)).toBeTruthy();
  expect(within(main).getByRole("button", { name: retry })).toBeTruthy();
  expect(within(main).getByRole("link", { name: home }).getAttribute("href")).toBe(`/${lang}`);
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe(`/${lang}`);
  expect(screen.getByText("Village Sqwhere").getAttribute("translate")).toBe("no");
});

test("pressing Try again calls retry once", () => {
  route.lang = "en";
  const retry = vi.fn();
  render(<LangError retry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});

test("an unknown language gets the English page", () => {
  route.lang = "xx";
  render(<LangError retry={vi.fn()} />);
  expect(screen.getByRole("heading", { level: 1, name: "We couldn't show this page" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to the home page" }).getAttribute("href")).toBe("/en");
});
