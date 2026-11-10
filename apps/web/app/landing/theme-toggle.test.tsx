import { runInNewContext } from "node:vm";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { THEME_INIT_SCRIPT, THEME_KEY } from "./theme";
import { ThemeToggle } from "./theme-toggle";

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
  render(<ThemeToggle {...labels} />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  cleanup();

  stubSystemTheme(true);
  render(<ThemeToggle {...labels} />);
  expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
});

test("switches theme, saves the choice and changes its label", () => {
  stubSystemTheme(false);
  render(<ThemeToggle {...labels} />);

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
  render(<ThemeToggle {...labels} />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
});

test("still switches when the browser refuses to save the choice", () => {
  stubSystemTheme(false);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  render(<ThemeToggle {...labels} />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
});

test("keeps both icons hidden from screen readers", () => {
  stubSystemTheme(false);
  const { container } = render(<ThemeToggle {...labels} />);
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
