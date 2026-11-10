import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { GatherHero } from "./gather-hero";

let resizeCallbacks: Array<() => void> = [];
const labels = { pause: "Pause animation", play: "Play animation" };

// jsdom cannot draw: a 2D context that accepts every call and draws nothing
function fakeContext() {
  const noop = () => {};
  return new Proxy(
    { getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4) }) } as Record<string, unknown>,
    {
      get: (target, key: string) => (key in target ? target[key] : noop),
      set: (target, key: string, value) => {
        target[key] = value;
        return true;
      },
    },
  );
}

function stubMotion(reduced: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("reduced-motion"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function stubCanvas(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => (available ? fakeContext() : null) as unknown as RenderingContext,
  );
}

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
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  stubMotion(false);
  stubCanvas(true);
  // jsdom has no layout: give the hero a width and the text a height
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1440);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(240);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderHero(heroLabels = labels) {
  return render(
    <GatherHero labelledBy="title" labels={heroLabels}>
      <h1 id="title">Builders across Africa, one square.</h1>
    </GatherHero>,
  );
}

const logoLayer = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('svg[fill="var(--logo)"]')!.parentElement!;

// a hidden element has no accessible name, so find the hidden button by its label attribute
const pauseButton = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('button[aria-label="Pause animation"]')!;

test("shows the headline in a region named by it", () => {
  renderHero();
  expect(screen.getByRole("region", { name: "Builders across Africa, one square." })).toBeTruthy();
});

test("places the text and the square once it has a width, and marks the hero ready", () => {
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  expect(section.hasAttribute("data-ready")).toBe(true);
  expect(section.style.height).not.toBe("");

  const square = container.querySelector<HTMLElement>("section > div[aria-hidden]")!;
  const tree = logoLayer(container);
  expect(square.style.width).toBe(square.style.height);
  expect(square.style.backgroundSize).toMatch(/^\d+px \d+px$/);
  // the logo sits exactly on the square
  expect(tree.style.left).toBe(square.style.left);
  expect(tree.style.top).toBe(square.style.top);
  expect(tree.style.width).toBe(square.style.width);
});

test("draws the logo from the Logo component, and hides the drawing from screen readers", () => {
  const { container } = renderHero();
  const logo = container.querySelector('svg[fill="var(--logo)"]');
  expect(logo).not.toBeNull();
  expect(logo!.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector("canvas")!.getAttribute("aria-hidden")).toBe("true");
});

test("offers a pause button under the square while the names are moving", () => {
  const { container } = renderHero();
  const button = screen.getByRole("button", { name: "Pause animation" });
  expect(button.style.display).toBe("grid");
  const square = container.querySelector<HTMLElement>("section > div[aria-hidden]")!;
  const squareBottom = parseFloat(square.style.top) + parseFloat(square.style.height);
  expect(parseFloat(button.style.top)).toBe(squareBottom + 12);
});

test("pauses and plays, and says what the next tap does", () => {
  renderHero();
  fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
  const button = screen.getByRole("button", { name: "Play animation" });
  expect(button.className).toMatch(/paused/);
  fireEvent.click(button);
  expect(screen.getByRole("button", { name: "Pause animation" }).className).not.toMatch(/paused/);
});

test("labels the pause button in French on the French page", () => {
  renderHero({ pause: "Mettre l'animation en pause", play: "Lire l'animation" });
  fireEvent.click(screen.getByRole("button", { name: "Mettre l'animation en pause" }));
  expect(screen.getByRole("button", { name: "Lire l'animation" })).toBeTruthy();
});

test("with reduced motion, nothing moves: the logo shows and there is no pause button", () => {
  stubMotion(true);
  const { container } = renderHero();
  expect(parseFloat(logoLayer(container).style.opacity)).toBe(1);
  expect(pauseButton(container).style.display).toBe("none");
  expect(screen.queryByRole("button", { name: "Pause animation" })).toBeNull();
});

test("when the browser cannot draw, it keeps the still frame: the logo and no pause button", () => {
  stubCanvas(false);
  const { container } = renderHero();
  expect(container.querySelector("section")!.hasAttribute("data-ready")).toBe(true);
  expect(parseFloat(logoLayer(container).style.opacity)).toBe(1);
  expect(pauseButton(container).style.display).toBe("none");
});

test("centres the text on a phone-width hero and not on a wide one", () => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  const phone = renderHero();
  expect(phone.container.querySelector("section > div")!.className).toMatch(/center/);
  cleanup();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1440);
  const wide = renderHero();
  expect(wide.container.querySelector("section > div")!.className).not.toMatch(/center/);
});

test("places everything again when the width changes", () => {
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  const before = section.style.height;

  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  resizeCallbacks.forEach((callback) => callback());
  expect(section.style.height).not.toBe(before);
});
