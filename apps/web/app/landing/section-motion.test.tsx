import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const steps = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("#how li")];
const stops = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>("#tour ol li")];

test("without IntersectionObserver nothing is ever hidden", () => {
  belowTheFold();
  const { container } = render(<LandingPage lang="en" />);
  for (const item of [...steps(container), ...stops(container)]) {
    expect(item.getAttribute("data-reveal")).not.toBe("waiting");
  }
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
});

test("steps and stops below the screen wait, then rise into place once as they scroll in", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  belowTheFold();
  const { container } = render(<LandingPage lang="en" />);
  const first = steps(container)[0];
  expect(first.getAttribute("data-reveal")).toBe("waiting");
  // still readable by screen readers while waiting
  expect(within(first).getByRole("heading", { name: "Idea" })).toBeTruthy();

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
  for (const item of [...steps(container), ...stops(container)]) {
    expect(item.getAttribute("data-reveal")).not.toBe("waiting");
  }
});

test("headings and lead text never wait to appear", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  belowTheFold();
  const { container } = render(<LandingPage lang="en" />);
  for (const el of container.querySelectorAll("h2, h2 + p")) {
    expect(el.closest("[data-reveal]")).toBeNull();
  }
});

test("steps in a row arrive one after another; stops arrive in order", () => {
  const { container } = render(<LandingPage lang="en" />);
  expect(steps(container).map((li) => li.style.getPropertyValue("--i4"))).toEqual(["0", "1", "2", "3"]);
  expect(steps(container).map((li) => li.style.getPropertyValue("--i2"))).toEqual(["0", "1", "0", "1"]);
  expect(stops(container).map((li) => li.style.getPropertyValue("--i"))).toEqual(["0", "1", "2", "3", "4"]);
});

test("each tour stop shows its share of the three minutes, hidden from screen readers", () => {
  const { container } = render(<LandingPage lang="en" />);
  const bars = stops(container).map((li) => li.querySelector<HTMLElement>("[aria-hidden='true'][style*='--size']")!);
  expect(bars.map((b) => Number(b.style.getPropertyValue("--size")).toFixed(3))).toEqual([
    "0.167",
    "0.250",
    "0.167",
    "0.417",
    "1.000",
  ]);
  // the times themselves stay as text
  expect(screen.getByText("3:00")).toBeTruthy();
});

test("marks the header link of the section being read", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { container } = render(<LandingPage lang="en" />);
  const header = within(container.querySelector("header")!);
  const how = header.getByRole("link", { name: "How it works" });
  const tour = header.getByRole("link", { name: "Tour" });

  scrollTo(container.querySelector("#tour")!, true);
  expect(tour.getAttribute("aria-current")).toBe("location");
  expect(how.hasAttribute("aria-current")).toBe(false);

  scrollTo(container.querySelector("#tour")!, false);
  scrollTo(container.querySelector("#how")!, true);
  expect(how.getAttribute("aria-current")).toBe("location");
  expect(tour.hasAttribute("aria-current")).toBe(false);
});

test("at the end of the page the last section is marked, even on a screen too tall to scroll it up", () => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const { container } = render(<LandingPage lang="en" />);
  const header = within(container.querySelector("header")!);

  // a tall screen: the band still crosses "How it works" when the page cannot scroll further
  scrollTo(container.querySelector("#how")!, true);
  scrollTo(container.querySelector("footer")!, true);
  expect(header.getByRole("link", { name: "Tour" }).getAttribute("aria-current")).toBe("location");
  expect(header.getByRole("link", { name: "How it works" }).hasAttribute("aria-current")).toBe(false);

  // scrolling back up, away from the end, gives the mark back
  scrollTo(container.querySelector("footer")!, false);
  expect(header.getByRole("link", { name: "How it works" }).getAttribute("aria-current")).toBe(
    "location",
  );
});

test("phones get the section links too: they are in the header, not only on wide screens", () => {
  const { container } = render(<LandingPage lang="en" />);
  const nav = within(container.querySelector("header nav")!);
  expect(nav.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("#how");
  expect(nav.getByRole("link", { name: "Tour" }).getAttribute("href")).toBe("#tour");
});

test("pressing 'Start the tour' says it is coming soon, and the note under it stands out", () => {
  const { container } = render(<LandingPage lang="en" />);
  const status = screen.getByRole("status");
  expect(status.textContent).toBe("");

  fireEvent.click(screen.getByRole("button", { name: /^Start the tour/ }));
  expect(status.textContent).toBe("The guided tour is coming soon.");
  expect(container.querySelector("#tour-note")!.hasAttribute("data-lit")).toBe(true);
  // nothing navigated
  expect(window.location.hash).toBe("");
});

test("in French, pressing 'Essayer la démo' says so in French", () => {
  const { container } = render(<LandingPage lang="fr" />);
  const hero = within(container.querySelector("section")!);
  fireEvent.click(hero.getByRole("button", { name: /^Essayer la démo/ }));
  expect(screen.getByRole("status").textContent).toBe("La démo arrive bientôt.");
  expect(container.querySelector("#demo-note")!.hasAttribute("data-lit")).toBe(true);
});

test("pressing 'Sign in' says it is coming soon", () => {
  const { container } = render(<LandingPage lang="en" />);
  fireEvent.click(within(container.querySelector("header")!).getByRole("button", { name: /^Sign in/ }));
  expect(screen.getByRole("status").textContent).toBe("Coming soon");
});
