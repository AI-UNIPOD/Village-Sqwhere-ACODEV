import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GatherHero } from "./gather-hero";

let resizeCallbacks: Array<() => void> = [];

beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  // jsdom has no layout: give the hero a width and the text a height
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1440);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(240);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderHero() {
  return render(
    <GatherHero labelledBy="title">
      <h1 id="title">Builders across Africa, one square.</h1>
    </GatherHero>,
  );
}

test("shows the headline in a region named by it", () => {
  renderHero();
  const region = screen.getByRole("region", { name: "Builders across Africa, one square." });
  expect(region).toBeTruthy();
});

test("places the text and the square once it has a width, and marks the hero ready", () => {
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  expect(section.hasAttribute("data-ready")).toBe(true);
  expect(section.style.height).not.toBe("");

  const [square, tree] = [...container.querySelectorAll<HTMLElement>('[aria-hidden="true"]')];
  expect(square.style.width).toBe(square.style.height);
  expect(square.style.backgroundSize).toMatch(/^\d+px \d+px$/);
  // the logo sits exactly on the square
  expect(tree.style.left).toBe(square.style.left);
  expect(tree.style.top).toBe(square.style.top);
  expect(tree.style.width).toBe(square.style.width);
});

test("draws the logo from the Logo component, hidden from screen readers", () => {
  const { container } = renderHero();
  const logo = container.querySelector('svg[fill="var(--logo)"]');
  expect(logo).not.toBeNull();
  expect(logo!.getAttribute("aria-hidden")).toBe("true");
});

test("centres the text on a phone-width hero", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  const { container } = renderHero();
  const copy = container.querySelector("section > div")!;
  expect(copy.className).toMatch(/center/);
});

test("does not centre the text on a wide hero", () => {
  const { container } = renderHero();
  const copy = container.querySelector("section > div")!;
  expect(copy.className).not.toMatch(/center/);
});

test("places everything again when the width changes", () => {
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  const before = section.style.height;

  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  resizeCallbacks.forEach((callback) => callback());
  expect(section.style.height).not.toBe(before);
});
