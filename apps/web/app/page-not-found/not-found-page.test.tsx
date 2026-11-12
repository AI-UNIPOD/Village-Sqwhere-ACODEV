import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import LangNotFound, { generateMetadata } from "../[lang]/not-found";

const route = vi.hoisted(() => ({ lang: "en" }));

vi.mock("next/root-params", () => ({ lang: async () => route.lang }));

afterEach(cleanup);

test.each([
  ["en", "We can't find this page", "This page doesn't exist. Check the address, or go back to the home page.", "Back to the home page"],
  ["fr", "Nous ne trouvons pas cette page", "Cette page n'existe pas. Vérifiez l'adresse, ou revenez à la page d'accueil.", "Retour à l'accueil"],
])("the %s not-found page says the page does not exist and links home", async (lang, heading, text, home) => {
  route.lang = lang;
  render(await LangNotFound());
  const main = screen.getByRole("main");
  expect(within(main).getByRole("heading", { level: 1, name: heading })).toBeTruthy();
  expect(within(main).getByText(text)).toBeTruthy();
  expect(within(main).getByRole("link", { name: home }).getAttribute("href")).toBe(`/${lang}`);
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe(`/${lang}`);
});

test("the brand name is kept out of translation", async () => {
  route.lang = "fr";
  render(await LangNotFound());
  expect(screen.getByText("Village Sqwhere").getAttribute("translate")).toBe("no");
});

test.each([
  ["en", "Page not found | Village Sqwhere"],
  ["fr", "Page introuvable | Village Sqwhere"],
  ["xx", "Page not found | Village Sqwhere"],
])("the not-found file sets the %s tab title", async (lang, title) => {
  route.lang = lang;
  expect((await generateMetadata()).title).toBe(title);
});

test("an unknown language gets the English page", async () => {
  route.lang = "xx";
  render(await LangNotFound());
  expect(screen.getByRole("heading", { level: 1, name: "We can't find this page" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to the home page" }).getAttribute("href")).toBe("/en");
});
