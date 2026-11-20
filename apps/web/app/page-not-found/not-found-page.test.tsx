import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import LangNotFound, { generateMetadata } from "../[lang]/not-found";
import { viewport as layoutViewport } from "../[lang]/layout";
import GlobalNotFound, { NOT_FOUND_INIT_SCRIPT, viewport } from "../global-not-found";
import { LOCALES } from "../locales";
import { SESSION_KEY } from "../session/session";
import { NotFoundPage } from "./not-found-page";
import { TabTitle } from "./tab-title";
import { ASKED_MAX } from "./ways-out";

const route = vi.hoisted(() => ({ lang: "en" }));

vi.mock("next/root-params", () => ({ lang: async () => route.lang }));
// next/font only works inside the Next.js compiler
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font" });
  return { Unbounded: font, Onest: font, JetBrains_Mono: font };
});

const signIn = () =>
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
const SCENE = "svg[viewBox='-20 -10 72 52']";
const places = () => screen.getByRole("navigation", { name: /^(Or go straight to|Ou aller directement à)$/ });
const links = (scope: HTMLElement) => within(scope).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")]);

beforeEach(() => {
  window.history.replaceState(null, "", "/en/ideas/nope");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.lang = "";
  document.title = "";
});

test.each([
  ["en", "We can't find this page", "The address may be mistyped, or the page may have moved. Here are the ways back.", "Back to the home page"],
  ["fr", "Nous ne trouvons pas cette page", "L'adresse est peut-être mal saisie, ou la page a été déplacée. Voici comment revenir.", "Retour à l'accueil"],
])("the %s page says the page does not exist and leads a visitor home", async (lang, heading, text, home) => {
  route.lang = lang;
  render(await LangNotFound());
  const main = within(screen.getByRole("main"));
  expect(main.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
  expect(main.getByText(text)).toBeTruthy();
  expect(main.getByRole("link", { name: home }).getAttribute("href")).toBe(`/${lang}`);
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe(`/${lang}`);
});

test("it shows the address that was asked for, decoded, and cuts a very long one", () => {
  window.history.replaceState(null, "", "/en/id%C3%A9es/nope");
  render(<NotFoundPage lang="en" />);
  expect(screen.getByText("/en/idées/nope").tagName).toBe("CODE");
  expect(screen.getByText(/You asked for/)).toBeTruthy();
  cleanup();

  window.history.replaceState(null, "", `/en/${"a".repeat(200)}`);
  render(<NotFoundPage lang="en" />);
  const shown = screen.getByText(/^\/en\/a+/).textContent ?? "";
  expect(shown).toHaveLength(ASKED_MAX + 1);
  expect(shown.at(-1)).toBe(String.fromCharCode(0x2026));
});

test("an address with a broken escape is shown as it was sent", () => {
  window.history.replaceState(null, "", "/en/%E0%A4%A");
  render(<NotFoundPage lang="en" />);
  expect(screen.getByText("/en/%E0%A4%A")).toBeTruthy();
});

test("with a page to go back to, a button goes back to it", () => {
  vi.spyOn(window.history, "length", "get").mockReturnValue(3);
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  render(<NotFoundPage lang="fr" />);
  fireEvent.click(screen.getByRole("button", { name: "Revenir là où vous étiez" }));
  expect(back).toHaveBeenCalledOnce();
});

test("with no page to go back to, there is no back button", () => {
  vi.spyOn(window.history, "length", "get").mockReturnValue(1);
  render(<NotFoundPage lang="en" />);
  expect(screen.queryByRole("button", { name: "Go back to where you were" })).toBeNull();
});

test("a visitor is offered how the village works and the way in", () => {
  render(<NotFoundPage lang="en" />);
  expect(links(places())).toEqual([
    ["How it works", "/en#how"],
    ["Sign in", "/en/sign-in"],
  ]);
});

test("a signed-in developer goes back to their village and is offered their own places", () => {
  signIn();
  render(<NotFoundPage lang="fr" />);
  expect(screen.getByRole("link", { name: "Retour à votre village" }).getAttribute("href")).toBe("/fr/village");
  expect(links(places())).toEqual([
    ["Idées", "/fr/ideas"],
    ["Espaces", "/fr/hubs"],
    ["Profil", "/fr/profile"],
  ]);
});

test("calling everyone back gathers them, says so, and can be undone", () => {
  const { container } = render(<NotFoundPage lang="en" />);
  const stage = container.querySelector(SCENE)!.parentElement!;
  const status = screen.getByRole("status");
  expect(status.textContent).toBe("404. Nobody is gathered at this address.");
  expect(stage.hasAttribute("data-gathered")).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: "Call everyone back" }));
  expect(stage.hasAttribute("data-gathered")).toBe(true);
  expect(status.textContent).toBe("Everyone is back under the tree. This page is still missing.");

  fireEvent.click(screen.getByRole("button", { name: "Let them wander" }));
  expect(stage.hasAttribute("data-gathered")).toBe(false);
  expect(status.textContent).toBe("404. Nobody is gathered at this address.");
});

test("the scene is a picture for the eye only: the status line carries its meaning", () => {
  const { container } = render(<NotFoundPage lang="en" />);
  const scene = container.querySelector(SCENE)!;
  expect(scene.getAttribute("aria-hidden")).toBe("true");
  // 26 people, each with a place to wander and a place in the tree
  const people = scene.querySelectorAll("g[style]");
  expect(people).toHaveLength(26);
  for (const person of people) expect(person.getAttribute("style")).toMatch(/--sx:.*--sy:.*--tx:.*--ty:/);
});

test("the brand name is kept out of translation", () => {
  render(<NotFoundPage lang="fr" />);
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

// ---------- the document for an address that matches no route ----------

test("the document for an unmatched address holds the page in every language, in English until its script runs", () => {
  const html = renderToStaticMarkup(<GlobalNotFound />);
  expect(html).toContain('<html lang="en"');
  expect(html).toContain('data-not-found="en"');
  expect(html).toContain('data-not-found="fr"');
  expect(html).toContain("We can&#x27;t find this page");
  expect(html).toContain("Nous ne trouvons pas cette page");
  // the script comes before the pages, so the language is set before anything is painted
  expect(html.indexOf("<script>")).toBeLessThan(html.indexOf("data-not-found"));
});

test.each([
  ["/fr/idees/nope", "fr", "Page introuvable | Village Sqwhere"],
  ["/en/nope", "en", "Page not found | Village Sqwhere"],
])("its script sets the language and the tab title from the address %s", (path, lang, title) => {
  window.history.replaceState(null, "", path);
  new Function(NOT_FOUND_INIT_SCRIPT)();
  expect(document.documentElement.lang).toBe(lang);
  expect(document.title).toBe(title);
});

// Like every other page, the not-found page opens in dark before anything is painted, unless the
// visitor saved light.
test.each([
  [null, "dark"],
  ["dark", "dark"],
  ["light", "light"],
])("its script opens the page in the saved theme, or dark: saved %s gives %s", (saved, theme) => {
  localStorage.clear();
  if (saved) localStorage.setItem("vs-theme", saved);
  document.documentElement.removeAttribute("data-theme");
  new Function(NOT_FOUND_INIT_SCRIPT)();
  expect(document.documentElement.getAttribute("data-theme")).toBe(theme);
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

// It has its own document, so it says how to colour the browser's bars itself: the same way as
// the layout's pages, which the early script then turns to the theme the page opened in.
test("the document for an unmatched address colours the browser's bars like every other page", () => {
  expect(viewport).toBe(layoutViewport);
  expect(viewport.themeColor).toHaveLength(2);
  expect(viewport.viewportFit).toBe("cover");
});

test("the tab title follows the document's language once the page is running", () => {
  document.documentElement.lang = "fr";
  render(<TabTitle titles={{ en: "Page not found | Village Sqwhere", fr: "Page introuvable | Village Sqwhere" }} />);
  expect(document.title).toBe("Page introuvable | Village Sqwhere");
});

test("an address in no known language leaves the document as it was sent, in English", () => {
  document.documentElement.lang = "en";
  window.history.replaceState(null, "", "/xx/nope");
  new Function(NOT_FOUND_INIT_SCRIPT)();
  expect(document.documentElement.lang).toBe("en");
});

test("the stylesheet shows the page of each language the app has", () => {
  const css = readFileSync("app/globals.css", "utf8");
  for (const lang of LOCALES) expect(css).toContain(`html[lang="${lang}"] [data-not-found="${lang}"]`);
});
