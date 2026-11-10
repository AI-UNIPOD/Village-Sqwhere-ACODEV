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

test("offers a dark mode toggle in each language", () => {
  render(<LandingPage lang="en" />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  cleanup();
  render(<LandingPage lang="fr" />);
  expect(screen.getByRole("button", { name: "Passer en mode sombre" })).toBeTruthy();
});

test("marks the header so the hero can place itself under it", () => {
  const { container } = render(<LandingPage lang="en" />);
  expect(container.querySelector("header[data-site-header]")).not.toBeNull();
});

test("the demo, the tour and sign-in say they are coming soon and do nothing", () => {
  render(<LandingPage lang="en" />);
  for (const name of [/^Try the demo/, /^Start the tour/, /^Sign in/]) {
    for (const button of screen.getAllByRole("button", { name })) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      expect(button.textContent).toContain("Coming soon");
      expect(() => fireEvent.click(button)).not.toThrow();
    }
  }
  expect(screen.getByText("The demo is coming soon.")).toBeTruthy();
  expect(screen.getByText("The guided tour is coming soon.")).toBeTruthy();
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
