import { runInNewContext } from "node:vm";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { THEME_INIT_SCRIPT, THEME_KEY } from "./theme";
import { ThemeButton } from "./theme-toggle";

function stubSystemTheme(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query.includes("dark"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const labels = { toDark: "Switch to dark mode", toLight: "Switch to light mode" };

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("offers dark mode on a light system and light mode on a dark one", () => {
  stubSystemTheme(false);
  render(<ThemeButton {...labels} className="theme" />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  cleanup();

  stubSystemTheme(true);
  render(<ThemeButton {...labels} className="theme" />);
  expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
});

test("switches theme, saves the choice and changes its label", () => {
  stubSystemTheme(false);
  render(<ThemeButton {...labels} className="theme" />);

  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");

  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
});

test("a chosen theme wins over the system setting", () => {
  stubSystemTheme(true);
  document.documentElement.setAttribute("data-theme", "light");
  render(<ThemeButton {...labels} className="theme" />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
});

test("still switches when the browser refuses to save the choice", () => {
  stubSystemTheme(false);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  render(<ThemeButton {...labels} className="theme" />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
});

test("spreads the new theme from the button through a view transition, unless motion is reduced", () => {
  const start = vi.fn((update: () => void) => {
    update();
    return { ready: new Promise<void>(() => {}), finished: Promise.resolve() };
  });
  Object.assign(document, { startViewTransition: start });
  stubSystemTheme(false);
  render(<ThemeButton {...labels} className="theme" />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(start).toHaveBeenCalledOnce();
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  cleanup();

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  document.documentElement.setAttribute("data-theme", "light");
  render(<ThemeButton {...labels} className="theme" />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(start).toHaveBeenCalledOnce();
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});

test("keeps both icons hidden from screen readers", () => {
  stubSystemTheme(false);
  const { container } = render(<ThemeButton {...labels} className="theme" />);
  const icons = container.querySelectorAll("svg");
  expect(icons).toHaveLength(2);
  for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
});

// runs the early script in an empty sandbox that has only a fake page and a fake storage
function runInitScript(read: () => string | null) {
  const attributes: Record<string, string> = {};
  runInNewContext(THEME_INIT_SCRIPT, {
    localStorage: { getItem: read },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attributes[k] = v) } },
  });
  return attributes;
}

test("the early script applies a saved theme and ignores anything else", () => {
  expect(runInitScript(() => "dark")).toEqual({ "data-theme": "dark" });
  expect(runInitScript(() => "light")).toEqual({ "data-theme": "light" });
  expect(runInitScript(() => "purple")).toEqual({});
  expect(runInitScript(() => null)).toEqual({});
});

test("the early script does nothing when storage is blocked", () => {
  const blocked = () => {
    throw new Error("denied");
  };
  expect(runInitScript(blocked)).toEqual({});
});

// ---------- the tooltip ----------

const tooltipOf = (host: HTMLElement) => host.querySelector("[data-tooltip]")?.textContent;

test("names what a tap does in a tooltip that follows the label", () => {
  stubSystemTheme(false);
  render(<ThemeButton {...labels} className="theme" />);
  const button = screen.getByRole("button");
  expect(tooltipOf(button)).toBe("Switch to dark mode");
  fireEvent.click(button);
  expect(tooltipOf(button)).toBe("Switch to light mode");
});

test("says it in French on the French page", () => {
  stubSystemTheme(false);
  render(<ThemeButton toDark="Passer en mode sombre" toLight="Passer en mode clair" className="theme" />);
  expect(tooltipOf(screen.getByRole("button"))).toBe("Passer en mode sombre");
});
