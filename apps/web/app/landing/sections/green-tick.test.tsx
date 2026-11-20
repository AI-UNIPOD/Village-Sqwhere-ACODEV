import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GreenTick } from "./green-tick";
import { copy } from "./green-tick-copy";

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduce && query.includes("reduce"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

// an IntersectionObserver the test can fire by hand
let intersect: () => void = () => {};
function stubObserver() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
        intersect = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
}

const pills = () => Array.from(document.querySelectorAll<HTMLElement>("[data-state]")).map((el) => el.textContent);
const live = () => document.querySelector("[aria-live='polite']")!;

beforeEach(() => stubMotion(false));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test.each([
  ["en", "The Green Tick says your role is real."],
  ["fr", "Le Green Tick montre que votre rôle est réel."],
] as const)("the %s section has its title, the three steps and the sample", (lang, title) => {
  render(<GreenTick lang={lang} />);
  expect(screen.getByRole("heading", { level: 2, name: title })).toBeTruthy();
  const steps = within(screen.getByRole("list", { name: copy[lang].stepsLabel })).getAllByRole("listitem");
  expect(steps).toHaveLength(3);
  expect(screen.getByText("Thandiwe Mokoena")).toBeTruthy();
  expect(document.querySelector("figcaption")!.textContent).toContain(copy[lang].demo.caption);
  expect(document.querySelector("section")!.id).toBe("green-tick");
});

// jsdom has no IntersectionObserver: the section keeps the finished page the server drew.
test("without a way to see it scroll into view it shows the finished state", () => {
  render(<GreenTick lang="en" />);
  expect(pills()).toEqual(["Done", "Done", "Done"]);
  expect(live().textContent).toBe(copy.en.win);
  expect(screen.getByRole("button", { name: "Watch it again" })).toBeTruthy();
});

test("with reduced motion it shows the finished state at once", () => {
  stubMotion(true);
  stubObserver();
  render(<GreenTick lang="fr" />);
  expect(pills()).toEqual(["Fait", "Fait", "Fait"]);
  expect(live().textContent).toBe(copy.fr.win);
  expect(screen.getByRole("button", { name: "Revoir" })).toBeTruthy();
});

test("the win sits in a polite live region and appears after the rows and the seal", () => {
  vi.useFakeTimers();
  stubObserver();
  render(<GreenTick lang="en" />);
  expect(pills()).toEqual(["Checking", "Waiting", "Waiting"]);
  expect(live().textContent).toBe("");

  act(() => intersect());
  act(() => vi.advanceTimersByTime(600));
  expect(pills()).toEqual(["Done", "Your turn", "Waiting"]);
  act(() => vi.advanceTimersByTime(600));
  expect(pills()).toEqual(["Done", "Done", "Waiting"]);
  act(() => vi.advanceTimersByTime(600));
  expect(pills()).toEqual(["Done", "Done", "Done"]);
  expect(live().textContent).toBe("");
  act(() => vi.advanceTimersByTime(1500));
  expect(live().textContent).toBe(copy.en.win);
  expect(live().getAttribute("aria-live")).toBe("polite");
});

test("Watch it again plays the rows once more, and not while it is playing", () => {
  vi.useFakeTimers();
  stubObserver();
  render(<GreenTick lang="en" />);
  const replay = screen.getByRole("button", { name: "Watch it again" });
  act(() => intersect());
  fireEvent.click(replay);
  act(() => vi.advanceTimersByTime(600));
  expect(pills()).toEqual(["Done", "Your turn", "Waiting"]);
  act(() => vi.advanceTimersByTime(3000));
  expect(live().textContent).toBe(copy.en.win);

  fireEvent.click(replay);
  expect(pills()).toEqual(["Checking", "Waiting", "Waiting"]);
  expect(live().textContent).toBe("");
  act(() => vi.advanceTimersByTime(3300));
  expect(pills()).toEqual(["Done", "Done", "Done"]);
});

test("leaving the page mid-animation leaves no timer running", () => {
  vi.useFakeTimers();
  stubObserver();
  const view = render(<GreenTick lang="en" />);
  act(() => intersect());
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
