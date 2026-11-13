import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  ["en", "How it works", "Tour"],
  ["fr", "Comment ça marche", "Visite"],
] as const)("the %s page links to its own sections", (lang, how, tour) => {
  const { container } = render(<LandingPage lang={lang} />);
  const header = within(container.querySelector("header")!);
  expect(header.getByRole("link", { name: how }).getAttribute("href")).toBe("#how");
  expect(header.getByRole("link", { name: tour }).getAttribute("href")).toBe("#tour");
  expect(container.querySelector("#how")).not.toBeNull();
  expect(container.querySelector("#tour")).not.toBeNull();
});

test("shows the four steps and the four tour stops that add up to three minutes", () => {
  const { container } = render(<LandingPage lang="en" />);
  const how = within(container.querySelector<HTMLElement>("#how")!);
  expect(how.getAllByRole("listitem")).toHaveLength(4);
  expect(how.getByRole("heading", { level: 3, name: "Matcher" })).toBeTruthy();

  const tour = within(container.querySelector<HTMLElement>("#tour")!);
  expect(tour.getAllByRole("listitem")).toHaveLength(5);
  expect(tour.getByText("3:00")).toBeTruthy();
});

test.each([
  ["en", "Passer en français", "/fr"],
  ["fr", "Switch to English", "/en"],
] as const)("the %s page offers the other language", (lang, label, href) => {
  render(<LandingPage lang={lang} />);
  const link = screen.getByRole("link", { name: label });
  expect(link.getAttribute("href")).toBe(href);
  expect(link.getAttribute("hreflang")).toBe(href.slice(1));
});

// Browser translation turned "Village Sqwhere" into "Village Square" and "EN" into "IN".
test.each([
  ["en", "Passer en français"],
  ["fr", "Switch to English"],
] as const)("the %s page keeps the brand name and the language switch out of translation", (lang, label) => {
  render(<LandingPage lang={lang} />);
  const wordmarks = screen.getAllByText("Village Sqwhere");
  expect(wordmarks).toHaveLength(2);
  for (const wordmark of wordmarks) expect(wordmark.getAttribute("translate")).toBe("no");
  expect(screen.getByRole("link", { name: label }).getAttribute("translate")).toBe("no");
});

test("offers a dark mode toggle in each language", () => {
  render(<LandingPage lang="en" />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  cleanup();
  render(<LandingPage lang="fr" />);
  expect(screen.getByRole("button", { name: "Passer en mode sombre" })).toBeTruthy();
});

// the slot, not the header, is measured: a pinned header is shorter than the one in the page
test("marks the header's slot so the hero can place itself under it", () => {
  const { container } = render(<LandingPage lang="en" />);
  expect(container.querySelector("[data-site-header][data-header-slot] > header")).not.toBeNull();
});

test("has one banner and one main navigation, whether or not the header is pinned", () => {
  render(<LandingPage lang="en" />);
  expect(screen.getAllByRole("banner")).toHaveLength(1);
  expect(screen.getAllByRole("navigation", { name: "Main" })).toHaveLength(1);
});

// jsdom has no layout, so this reads the stylesheet. At 360px the French links need 311px but
// the header's gutter for the language button left the row 280px, and "Comment ça marche" wrapped.
test("on phones the section links reach into the language button's gutter, and not on wide screens", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  const [phone, wide] = [...css.matchAll(/\.navLinks \{([^}]*)\}/g)].map((m) => m[1]);
  expect(phone).toContain("flex: 0 0 calc(100% + var(--float-gutter) - var(--space-4));");
  expect(wide).toContain("flex: 0 1 auto;");
});

test("the demo and the tour say they are coming soon and do nothing", () => {
  const { container } = render(<LandingPage lang="en" />);
  for (const name of [/^Try the demo/, /^Start the tour/]) {
    for (const button of screen.getAllByRole("button", { name })) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.textContent).toContain("Coming soon");
      expect(() => fireEvent.click(button)).not.toThrow();
    }
  }
  expect(container.querySelector("#demo-note")?.textContent).toBe("The demo is coming soon.");
  expect(container.querySelector("#tour-note")?.textContent).toBe("The guided tour is coming soon.");
});

// the hero's actions, in order: everything you can press under the headline
function heroActions(headline: string) {
  const copy = screen.getByRole("heading", { level: 1, name: headline }).parentElement!;
  return Array.from(copy.querySelectorAll<HTMLElement>("a, button"));
}

test.each([
  ["en", "Builders across Africa, one square.", "Join the village", "Take the tour", "Try the demo, Coming soon"],
  ["fr", "Toute l'Afrique, une seule place.", "Rejoindre le village", "Faire la visite", "Essayer la démo, Bientôt disponible"],
] as const)("the %s hero leads to sign-in first, then the tour, then the demo", (lang, headline, join, tour, demo) => {
  render(<LandingPage lang={lang} />);
  const actions = heroActions(headline);
  expect(actions.map((action) => action.textContent)).toEqual([join, tour, demo]);

  const [first, , last] = actions;
  expect(first).toBe(screen.getByRole("link", { name: join }));
  expect(first.getAttribute("href")).toBe(`/${lang}/sign-in`);
  expect(last.tagName).toBe("BUTTON");
  expect(last.getAttribute("aria-disabled")).toBe("true");
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

test("the French page says the same in French", () => {
  render(<LandingPage lang="fr" />);
  // the hero and the footer each have one
  const demo = screen.getAllByRole("button", { name: /^Essayer la démo, Bientôt disponible/ });
  expect(demo).toHaveLength(2);
  expect(screen.getByText("La démo arrive bientôt.")).toBeTruthy();
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
  ["en", "Passer en français", "Switch to dark mode", "Pause animation"],
  ["fr", "Switch to English", "Passer en mode sombre", "Mettre l'animation en pause"],
] as const)("the %s page gives its language and theme buttons a tooltip in its own words", (lang, language, theme, motion) => {
  render(<LandingPage lang={lang} />);
  const tooltipOf = (host: Element) => host.querySelector("[data-tooltip]")?.textContent;
  expect(tooltipOf(screen.getByRole("link", { name: language }))).toBe(language);
  expect(tooltipOf(screen.getByRole("button", { name: theme }))).toBe(theme);
  // the motion button is hidden until the hero script has placed it, so look past that
  const motionButton = screen
    .getAllByRole("button", { hidden: true })
    .find((b) => b.textContent?.includes(motion));
  expect(motionButton).toBeDefined();
  expect(motionButton!.querySelector("[data-tooltip]")).toBeNull();
});
