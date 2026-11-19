import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { NOTICE_KEY, ReducedMotionNotice, forgetNotice } from "./reduced-motion-notice";
import { SITE_MOTION_KEY, forgetSiteMotion, reducesMotion } from "./site-motion";

// a system setting the test can switch while the page is open
function systemMotion(reduced: boolean) {
  const listeners = new Set<() => void>();
  let matches = reduced;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && matches;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return (next: boolean) => {
    matches = next;
    act(() => listeners.forEach((listener) => listener()));
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  forgetNotice();
  forgetSiteMotion();
  vi.unstubAllGlobals();
});

test("with reduced motion on, it says once that animations are toned down", () => {
  systemMotion(true);
  render(<ReducedMotionNotice lang="en" />);
  const dialog = screen.getByRole("dialog", { name: "Animations are toned down" });
  expect(dialog.textContent).toContain("accessibility settings");
  expect(screen.getByRole("button", { name: "Turn animations on" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Keep them toned down" })).toBeTruthy();
});

test("with reduced motion off, it shows nothing", () => {
  systemMotion(false);
  render(<ReducedMotionNotice lang="en" />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("it speaks French on a French page", () => {
  systemMotion(true);
  render(<ReducedMotionNotice lang="fr" />);
  expect(screen.getByRole("dialog", { name: "Les animations sont atténuées" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Activer les animations" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Les garder atténuées" })).toBeTruthy();
});

test("keeping animations toned down dismisses it, and it stays dismissed on the next visit", () => {
  systemMotion(true);
  render(<ReducedMotionNotice lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Keep them toned down" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem(NOTICE_KEY)).toBe("seen");
  expect(localStorage.getItem(SITE_MOTION_KEY)).toBeNull();
  expect(reducesMotion()).toBe(true);

  cleanup();
  render(<ReducedMotionNotice lang="en" />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("Escape dismisses it the same way", () => {
  systemMotion(true);
  render(<ReducedMotionNotice lang="en" />);
  // the native dialog fires "close" when Escape is pressed
  fireEvent(screen.getByRole("dialog"), new Event("close"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem(NOTICE_KEY)).toBe("seen");
});

test("turning animations on keeps the choice, stops the notice and reloads so every screen moves", () => {
  systemMotion(true);
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  render(<ReducedMotionNotice lang="en" />);
  expect(reducesMotion()).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Turn animations on" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem(SITE_MOTION_KEY)).toBe("on");
  expect(localStorage.getItem(NOTICE_KEY)).toBe("seen");
  expect(reload).toHaveBeenCalledOnce();
  // the device still asks for reduced motion, and the page no longer holds back
  expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
  expect(reducesMotion()).toBe(false);

  cleanup();
  render(<ReducedMotionNotice lang="en" />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("it follows the setting while the page is open, and a change is not a dismissal", () => {
  const change = systemMotion(false);
  render(<ReducedMotionNotice lang="en" />);
  expect(screen.queryByRole("dialog")).toBeNull();

  change(true);
  expect(screen.getByRole("dialog", { name: "Animations are toned down" })).toBeTruthy();

  change(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(localStorage.getItem(NOTICE_KEY)).toBeNull();

  change(true);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

test("with storage blocked it still stays dismissed for the rest of the visit", () => {
  systemMotion(true);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  render(<ReducedMotionNotice lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Keep them toned down" }));
  expect(screen.queryByRole("dialog")).toBeNull();

  cleanup();
  render(<ReducedMotionNotice lang="en" />);
  expect(screen.queryByRole("dialog")).toBeNull();
  vi.restoreAllMocks();
});

// jsdom does no animation, so the rule itself is read: the notice carries the class that turns
// the dialog's arrival off, and that rule comes after the one that gives reduced motion a fade.
test("the notice does not animate, not even the fade the other dialogs get", () => {
  systemMotion(true);
  render(<ReducedMotionNotice lang="en" />);
  expect(screen.getByRole("dialog").className).toMatch(/still/);

  const css = readFileSync(path.join(__dirname, "confirm-dialog.module.css"), "utf8");
  const still = css.indexOf(".still[open]");
  expect(still).toBeGreaterThan(css.indexOf("animation-name: fade"));
  expect(css.slice(still, css.indexOf("}", still))).toMatch(/animation:\s*none/);
});
