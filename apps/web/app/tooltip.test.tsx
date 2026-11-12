import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { Tooltip } from "./tooltip";

// Tooltips remember when the last one closed, so every test starts a long way after the last.
let clock = 0;

beforeEach(() => {
  clock += 10_000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderButtons() {
  render(
    <>
      <button type="button" aria-label="Switch to dark mode">
        <Tooltip label="Switch to dark mode" side="left" />
      </button>
      <a href="#language" aria-label="Passer en français">
        <Tooltip label="Passer en français" side="left" />
      </a>
    </>,
  );
  return {
    button: screen.getByRole("button", { name: "Switch to dark mode" }),
    link: screen.getByRole("link", { name: "Passer en français" }),
  };
}

const bubbleOf = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-tooltip]")!;
const isOpen = (host: HTMLElement) => bubbleOf(host).hasAttribute("data-open");

// jsdom has no pointer events with a type, so send one by hand
function pointer(host: HTMLElement, type: "pointerenter" | "pointerleave", pointerType = "mouse") {
  const event = new Event(type);
  Object.defineProperty(event, "pointerType", { value: pointerType });
  host.dispatchEvent(event);
}

// jsdom cannot tell a keyboard focus from a mouse click, so say which one it is
function focus(host: HTMLElement, by: "keyboard" | "mouse" = "keyboard") {
  vi.spyOn(host, "matches").mockImplementation((selector) => selector === ":focus-visible" && by === "keyboard");
  host.focus();
}

const press = (key: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

test("says what the button does, in the page's words, and is hidden until asked for", () => {
  const { button, link } = renderButtons();
  expect(bubbleOf(button).textContent).toBe("Switch to dark mode");
  expect(bubbleOf(link).textContent).toBe("Passer en français");
  expect(isOpen(button)).toBe(false);
  expect(isOpen(link)).toBe(false);
});

test("is not read out a second time: the button already has its name", () => {
  const { button } = renderButtons();
  expect(bubbleOf(button).getAttribute("aria-hidden")).toBe("true");
  // the accessible name is the label alone, not the label and the tooltip
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(button.getAttribute("aria-label")).toBe("Switch to dark mode");
});

test("a mouse over the button opens it after a wait, and leaving closes it", () => {
  const { button } = renderButtons();
  pointer(button, "pointerenter");
  expect(isOpen(button)).toBe(true);
  expect(bubbleOf(button).hasAttribute("data-wait")).toBe(true); // the stylesheet holds it back
  pointer(button, "pointerleave");
  expect(isOpen(button)).toBe(false);
  expect(bubbleOf(button).hasAttribute("data-wait")).toBe(false);
});

test("a finger does not open it: a tap would leave it stuck on", () => {
  const { button } = renderButtons();
  pointer(button, "pointerenter", "touch");
  expect(isOpen(button)).toBe(false);
});

test("keyboard focus opens it at once, with no wait, and moving on closes it", () => {
  const { button } = renderButtons();
  focus(button);
  expect(isOpen(button)).toBe(true);
  expect(bubbleOf(button).hasAttribute("data-wait")).toBe(false);
  button.blur();
  expect(isOpen(button)).toBe(false);
});

test("works on a link as well as a button", () => {
  const { link } = renderButtons();
  focus(link);
  expect(isOpen(link)).toBe(true);
});

test("focus from a mouse click does not open it: only keyboard focus does", () => {
  const { button } = renderButtons();
  focus(button, "mouse");
  expect(isOpen(button)).toBe(false);
});

test("a mouse that is over a focused button does not close it by leaving", () => {
  const { button } = renderButtons();
  focus(button);
  pointer(button, "pointerenter");
  pointer(button, "pointerleave");
  expect(isOpen(button)).toBe(true);
  button.blur();
  expect(isOpen(button)).toBe(false);
});

test("Escape closes it, wherever the keyboard is, and it stays closed until the next visit", () => {
  const { button } = renderButtons();
  pointer(button, "pointerenter");
  expect(isOpen(button)).toBe(true);
  press("Escape");
  expect(isOpen(button)).toBe(false);
  // still over the button: no reason to open again
  press("a");
  expect(isOpen(button)).toBe(false);
  pointer(button, "pointerleave");
  pointer(button, "pointerenter");
  expect(isOpen(button)).toBe(true);

  focus(button);
  press("Escape");
  expect(isOpen(button)).toBe(false);
  button.blur();
  pointer(button, "pointerleave");
  focus(button);
  expect(isOpen(button)).toBe(true);
});

test("Escape does nothing when no tooltip is open", () => {
  const { button } = renderButtons();
  expect(() => press("Escape")).not.toThrow();
  expect(isOpen(button)).toBe(false);
});

test("the next one opens at once, without its wait, right after another closes", () => {
  const { button, link } = renderButtons();
  pointer(button, "pointerenter");
  pointer(button, "pointerleave");
  clock += 200;
  pointer(link, "pointerenter");
  expect(isOpen(link)).toBe(true);
  expect(bubbleOf(link).hasAttribute("data-instant")).toBe(true);
  expect(bubbleOf(link).hasAttribute("data-wait")).toBe(false);

  // after a pause the wait is back
  pointer(link, "pointerleave");
  clock += 2000;
  pointer(button, "pointerenter");
  expect(bubbleOf(button).hasAttribute("data-instant")).toBe(false);
  expect(bubbleOf(button).hasAttribute("data-wait")).toBe(true);
});

test("when the button goes away, Escape no longer reaches the tooltip", () => {
  const { button } = renderButtons();
  pointer(button, "pointerenter");
  cleanup();
  expect(() => press("Escape")).not.toThrow();
});

// ---------- near the bottom of the screen ----------

const rect = (top: number, bottom: number) =>
  ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

// where the button and its tooltip would sit, as a browser lays them out
function layOut(host: HTMLElement, hostAt: [number, number], tipAt: [number, number]) {
  vi.stubGlobal("innerHeight", 800);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return this === host ? rect(...hostAt) : rect(...tipAt);
  });
}

function renderPause(side: "below" | "left") {
  render(
    <button type="button" aria-label="Pause animation">
      <Tooltip label="Pause animation" side={side} />
    </button>,
  );
  return screen.getByRole("button");
}

test("a tooltip under a button at the bottom of a phone screen goes above it instead of off the screen", () => {
  const button = renderPause("below");
  layOut(button, [764, 800], [808, 846]); // the tooltip would end at 846 on an 800px screen
  pointer(button, "pointerenter");
  expect(bubbleOf(button).hasAttribute("data-flip")).toBe(true);
});

test("a tooltip under a button with room below stays below", () => {
  const button = renderPause("below");
  layOut(button, [100, 136], [144, 182]);
  pointer(button, "pointerenter");
  expect(bubbleOf(button).hasAttribute("data-flip")).toBe(false);
});

test("it is measured again each time, so it comes back down once there is room", () => {
  const button = renderPause("below");
  layOut(button, [764, 800], [808, 846]);
  pointer(button, "pointerenter");
  pointer(button, "pointerleave");
  layOut(button, [100, 136], [144, 182]);
  pointer(button, "pointerenter");
  expect(bubbleOf(button).hasAttribute("data-flip")).toBe(false);
});

test("it stays below when there is no more room above", () => {
  const button = renderPause("below");
  layOut(button, [10, 46], [54, 92]);
  vi.stubGlobal("innerHeight", 60); // the tooltip would end at 92, off the screen, but only 10px are free above the button
  pointer(button, "pointerenter");
  expect(bubbleOf(button).hasAttribute("data-flip")).toBe(false);
});

test("a tooltip beside its button never flips", () => {
  const button = renderPause("left");
  layOut(button, [764, 800], [808, 846]);
  pointer(button, "pointerenter");
  expect(bubbleOf(button).hasAttribute("data-flip")).toBe(false);
});

// ---------- the stylesheet ----------

// jsdom runs no layout or animation, so this reads the stylesheet
const css = readFileSync(join(__dirname, "tooltip.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();

test("is a raised surface from the design tokens, with no raw colour", () => {
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  for (const token of [
    "--surface-raised",
    "--line",
    "--shadow-2",
    "--radius-xs",
    "--type-body-s",
    "--text",
    "--dur-menu",
    "--dur-menu-out",
    "--ease-out",
    "--delay-spinner",
  ]) {
    expect(css, token).toContain(`var(${token})`);
  }
});

test("shows only while open, and a mouse waits where a keyboard does not", () => {
  expect(css).toMatch(/\.tip \{[^}]*visibility: hidden/);
  expect(css).toMatch(/\.tip\[data-open\] \{[^}]*visibility: visible/);
  expect(css).toMatch(/\.tip\[data-open\]\[data-wait\] \{[^}]*transition-delay: var\(--delay-spinner\)/);
  expect(css).toMatch(/\.tip\[data-instant\] \{[^}]*transition-duration: 0s/);
});

test("keeps its fade and drops its scale for a visitor who asks for reduced motion", () => {
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{(.*)\}$/.exec(css)?.[1] ?? "";
  expect(reduced).toContain("transform: none");
  expect(reduced).not.toMatch(/opacity: 1/);
});

test("fits inside a 360px screen next to the button it names", () => {
  // the room beside the round buttons at 360px is 360 - 16 - 36 - 8 = 300px, so the tip stays under 16rem
  expect(css).toMatch(/max-inline-size: min\(16rem, calc\(100vw - var\(--space-8\)\)\)/);
});

test("a flipped tooltip sits above its button and grows from its bottom edge", () => {
  expect(css).toMatch(/\.below\[data-flip\] \{[^}]*bottom: calc\(100% \+ var\(--space-2\)\)/);
  expect(css).toMatch(/\.below\[data-flip\] \{[^}]*transform-origin: center bottom/);
});
