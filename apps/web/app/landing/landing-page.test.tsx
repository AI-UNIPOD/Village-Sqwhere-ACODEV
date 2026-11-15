import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LandingPage } from "./landing-page";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  // jsdom cannot draw, so the hero shows its still frame
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test.each([
  ["en", "Builders across Africa, one square."],
  ["fr", "Toute l'Afrique, une seule place."],
] as const)("the %s page opens with its headline", (lang, headline) => {
  render(<LandingPage lang={lang} />);
  expect(screen.getByRole("heading", { level: 1, name: headline })).toBeTruthy();
});

test.each([
  ["en", "Matcher", "Hub", "FAQ"],
  ["fr", "Matcher", "Espace", "FAQ"],
] as const)("the %s header links to the matcher, the hub and the questions", (lang, matcher, hub, faq) => {
  const { container } = render(<LandingPage lang={lang} />);
  const header = within(container.querySelector("header")!);
  for (const [name, id] of [
    [matcher, "matcher"],
    [hub, "hub"],
    [faq, "faq"],
  ]) {
    expect(header.getByRole("link", { name }).getAttribute("href")).toBe(`#${id}`);
    expect(container.querySelector(`#${id}`)).not.toBeNull();
  }
});

test("the sections come in the order of the story: matcher, how it works, hub, Green Tick, questions", () => {
  const { container } = render(<LandingPage lang="en" />);
  const ids = Array.from(container.querySelectorAll("main section[id]")).map((section) => section.id);
  expect(ids.filter((id) => ["matcher", "how", "hub", "green-tick", "faq"].includes(id))).toEqual([
    "matcher",
    "how",
    "hub",
    "green-tick",
    "faq",
  ]);
});

// jsdom has no layout, so this reads the stylesheet: on phones the section links take a row of
// their own under the logo and the switches, and on wide screens they share the one row.
test("on phones the section links get a row of their own, and not on wide screens", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  const [phone, wide] = [...css.matchAll(/\.navLinks \{([^}]*)\}/g)].map((m) => m[1]);
  expect(phone).toContain("flex: 0 0 100%;");
  expect(wide).toContain("flex: 0 1 auto;");
});

test("every demo button is a real button, and the hero's has its line", () => {
  const { container } = render(<LandingPage lang="en" />);
  const demo = screen.getAllByRole("button", { name: "Try the demo" });
  expect(demo.length).toBeGreaterThanOrEqual(2);
  for (const button of demo) expect(button.hasAttribute("aria-disabled")).toBe(false);
  expect(container.querySelector("#demo-note")?.textContent).toBe(
    "No sign-up. Look around everything in read-only mode. A short tour is inside.",
  );
});

// the hero's actions, in order: everything you can press under the headline
function heroActions(headline: string) {
  const copy = screen.getByRole("heading", { level: 1, name: headline }).parentElement!;
  return Array.from(copy.querySelectorAll<HTMLElement>("a, button"));
}

test.each([
  ["en", "Builders across Africa, one square.", "Join the village", "Try the demo"],
  ["fr", "Toute l'Afrique, une seule place.", "Rejoindre le village", "Essayer la démo"],
] as const)("the %s hero has two doors: sign-in first, then the demo", (lang, headline, join, demo) => {
  render(<LandingPage lang={lang} />);
  const actions = heroActions(headline);
  expect(actions.map((action) => action.textContent)).toEqual([join, demo]);

  const [first, last] = actions;
  expect(first.getAttribute("href")).toBe(`/${lang}/sign-in`);
  expect(first.getAttribute("href")).toBe(`/${lang}/sign-in`);
  expect(last.tagName).toBe("BUTTON");
  expect(last.hasAttribute("aria-disabled")).toBe(false);
});

test("the demo note sits under the demo button, not under the first action", () => {
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return this.textContent?.startsWith("Try the demo") ? 320 : 0;
  });
  const { container } = render(<LandingPage lang="en" />);
  expect(container.querySelector<HTMLElement>("#demo-note")!.style.marginLeft).toBe("320px");
});

test.each([
  ["en", "Sign in"],
  ["fr", "Connexion"],
] as const)("the %s page links to its sign-in page from the header and the footer", (lang, name) => {
  render(<LandingPage lang={lang} />);
  const links = screen.getAllByRole("link", { name });
  expect(links).toHaveLength(2);
  for (const link of links) expect(link.getAttribute("href")).toBe(`/${lang}/sign-in`);
});

test.each([
  ["en", "AI UniPod, University of Lagos (opens in a new tab)", "Built at AI UniPod, University of Lagos (opens in a new tab) for ACODev 2026."],
  ["fr", "l'AI UniPod de l'Université de Lagos (s'ouvre dans un nouvel onglet)", "Conçu à l'AI UniPod de l'Université de Lagos (s'ouvre dans un nouvel onglet) pour l'ACODev 2026."],
] as const)("the %s footer credits the AI UniPod and links to its site in a new tab", (lang, name, line) => {
  render(<LandingPage lang={lang} />);
  const link = within(screen.getByRole("contentinfo")).getByRole("link", { name });
  expect(link.getAttribute("href")).toBe("https://aiunipod.unilag.edu.ng/");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.parentElement!.textContent).toBe(line);
});

test("the French page says the same in French", () => {
  render(<LandingPage lang="fr" />);
  expect(screen.getAllByRole("button", { name: "Essayer la démo" }).length).toBeGreaterThanOrEqual(2);
  expect(
    screen.getAllByText("Sans inscription. Parcourez tout en lecture seule. Une courte visite guidée est incluse.")
      .length,
  ).toBeGreaterThanOrEqual(1);
});

test("has one main landmark and no empty links or buttons", () => {
  const { container } = render(<LandingPage lang="en" />);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  for (const el of container.querySelectorAll("a, button")) {
    expect(el.textContent?.trim() || el.getAttribute("aria-label")).toBeTruthy();
  }
});

test("draws the logo from the Logo component, hidden from screen readers", () => {
  const { container } = render(<LandingPage lang="en" />);
  const logos = container.querySelectorAll('svg[fill="var(--logo)"]');
  expect(logos.length).toBeGreaterThanOrEqual(3); // header, hero square, footer
  for (const logo of logos) expect(logo.getAttribute("aria-hidden")).toBe("true");
});

// The round buttons have no words on them, so each says what it does in a tooltip, in the page's
// language. The hero's motion button shows its words, so it needs no tooltip.
test.each([
  ["en", "Français", "Switch to dark mode", "Pause animation"],
  ["fr", "English", "Passer en mode sombre", "Mettre l'animation en pause"],
] as const)("the %s page gives its theme button a tooltip in its own words", (lang, language, theme, motion) => {
  render(<LandingPage lang={lang} />);
  const tooltipOf = (host: Element) => host.querySelector("[data-tooltip]")?.textContent;
  // the language switch shows both languages, so it needs no tooltip
  expect(tooltipOf(screen.getByRole("link", { name: language }))).toBeUndefined();
  expect(tooltipOf(screen.getByRole("button", { name: theme }))).toBe(theme);
  // the motion button is hidden until the hero script has placed it, so look past that
  const motionButton = screen
    .getAllByRole("button", { hidden: true })
    .find((b) => b.textContent?.includes(motion));
  expect(motionButton).toBeDefined();
  expect(motionButton!.querySelector("[data-tooltip]")).toBeNull();
});
