import { cleanup, render, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LandingPage } from "./landing-page";

// A stand-in for the browser's IntersectionObserver that the test can drive by hand.
type Watcher = { callback: IntersectionObserverCallback; targets: Set<Element> };
let watchers: Watcher[] = [];

class FakeObserver {
  private watcher: Watcher;
  constructor(callback: IntersectionObserverCallback) {
    this.watcher = { callback, targets: new Set() };
    watchers.push(this.watcher);
  }
  observe(el: Element) {
    this.watcher.targets.add(el);
  }
  unobserve(el: Element) {
    this.watcher.targets.delete(el);
  }
  disconnect() {
    this.watcher.targets.clear();
  }
}

// tell every observer watching `el` that it entered or left view
function scrollTo(el: Element, inView: boolean) {
  for (const w of watchers) {
    if (!w.targets.has(el)) continue;
    const entry = { target: el, isIntersecting: inView } as IntersectionObserverEntry;
    w.callback([entry], {} as IntersectionObserver);
  }
}

// pretend everything below the hero starts under the bottom of the screen
function belowTheFold() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const top = this.closest("section") && !this.closest("section")!.querySelector("h1") ? 2000 : 0;
    return { top, bottom: top + 10, left: 0, right: 10, width: 10, height: 10, x: 0, y: top } as DOMRect;
  });
}

beforeEach(() => {
  watchers = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// the items that rise into place: the principles and the closing band's logo
const items = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("main [data-reveal]")];

test("without IntersectionObserver nothing is ever hidden", () => {
  belowTheFold();
  const { container } = render(<LandingPage lang="en" />);
  expect(items(container).length).toBeGreaterThan(0);
  for (const item of items(container)) expect(item.getAttribute("data-reveal")).not.toBe("waiting");
});

test("items below the screen wait, then rise into place once as they scroll in", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  belowTheFold();
  const { container } = render(<LandingPage lang="en" />);
  const first = items(container)[0];
  expect(first.getAttribute("data-reveal")).toBe("waiting");
  // still readable by screen readers while waiting
  expect(first.textContent?.trim()).not.toBe("");

  scrollTo(first, true);
  expect(first.getAttribute("data-reveal")).toBe("shown");
  // and only once: leaving and coming back does not hide it again
  scrollTo(first, false);
  expect(first.getAttribute("data-reveal")).toBe("shown");
  for (const w of watchers) expect(w.targets.has(first)).toBe(false);
});

test("content already on screen when the page opens is never hidden", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { container } = render(<LandingPage lang="en" />); // jsdom puts everything at the top
  for (const item of items(container)) expect(item.getAttribute("data-reveal")).not.toBe("waiting");
});

test("headings and lead text never wait to appear", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  belowTheFold();
  const { container } = render(<LandingPage lang="en" />);
  for (const el of container.querySelectorAll("h2, h2 + p")) {
    expect(el.closest("[data-reveal]")).toBeNull();
  }
});

test("marks the header link of the section being read", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { container } = render(<LandingPage lang="en" />);
  const header = within(container.querySelector("header")!);
  const matcher = header.getByRole("link", { name: "Matcher" });
  const hub = header.getByRole("link", { name: "Hub" });

  scrollTo(container.querySelector("#hub")!, true);
  expect(hub.getAttribute("aria-current")).toBe("location");
  expect(matcher.hasAttribute("aria-current")).toBe(false);

  scrollTo(container.querySelector("#hub")!, false);
  scrollTo(container.querySelector("#matcher")!, true);
  expect(matcher.getAttribute("aria-current")).toBe("location");
  expect(hub.hasAttribute("aria-current")).toBe(false);
});

test("at the end of the page the last section is marked, even on a screen too tall to scroll it up", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { container } = render(<LandingPage lang="en" />);
  const header = within(container.querySelector("header")!);

  scrollTo(container.querySelector("#hub")!, true);
  scrollTo(container.querySelector("footer")!, true);
  expect(header.getByRole("link", { name: "FAQ" }).getAttribute("aria-current")).toBe("location");
  expect(header.getByRole("link", { name: "Hub" }).hasAttribute("aria-current")).toBe(false);

  // scrolling back up, away from the end, gives the mark back
  scrollTo(container.querySelector("footer")!, false);
  expect(header.getByRole("link", { name: "Hub" }).getAttribute("aria-current")).toBe("location");
});

test("phones get the section links too: they are in the header, not only on wide screens", () => {
  const { container } = render(<LandingPage lang="en" />);
  const nav = within(container.querySelector("header nav")!);
  expect(nav.getByRole("link", { name: "Matcher" }).getAttribute("href")).toBe("#matcher");
  expect(nav.getByRole("link", { name: "FAQ" }).getAttribute("href")).toBe("#faq");
});
