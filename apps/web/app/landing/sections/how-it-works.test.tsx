import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { copy } from "./how-it-works-copy";
import { HowItWorks } from "./how-it-works";

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

// tell every observer watching `el` that it crossed the reading band
function read(el: Element) {
  act(() => {
    for (const w of watchers) {
      if (!w.targets.has(el)) continue;
      w.callback([{ target: el, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
}

// the four steps: the children of the first list in the section
const stepsOf = (container: HTMLElement) => [...container.querySelector("ol")!.children] as HTMLElement[];

beforeEach(() => {
  watchers = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test.each(["en", "fr"] as const)("the %s section shows its heading and lead", (lang) => {
  render(<HowItWorks lang={lang} />);
  expect(screen.getByRole("heading", { level: 2, name: copy[lang].title })).toBeTruthy();
  expect(screen.getByText(copy[lang].lead)).toBeTruthy();
});

test("the section is the page's #how anchor, named by its heading", () => {
  const { container } = render(<HowItWorks lang="en" />);
  const section = container.querySelector("section#how")!;
  expect(section.getAttribute("aria-labelledby")).toBe("how-title");
});

test.each(["en", "fr"] as const)("the %s section lists the four steps in order", (lang) => {
  const { container } = render(<HowItWorks lang={lang} />);
  const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
  expect(titles).toEqual(copy[lang].steps.map((step) => step.title));
  // read off the element: the matcher's text normaliser would fold the French narrow spaces
  const texts = stepsOf(container).map((step) => step.querySelector("p")!.textContent);
  expect(texts).toEqual(copy[lang].steps.map((step) => step.text));
});

test("each step has a numbered label, 01 to 04", () => {
  const { container } = render(<HowItWorks lang="en" />);
  const numbers = stepsOf(container).map((step) => step.firstElementChild!.textContent);
  expect(numbers).toEqual(["01", "02", "03", "04"]);
});

test.each(["en", "fr"] as const)("each step's view shows its key text in %s", (lang) => {
  const t = copy[lang];
  const { container } = render(<HowItWorks lang={lang} />);
  const steps = stepsOf(container);
  const [idea, matcher, team, hub] = steps.map((step) => within(step));

  expect(idea.getByText(t.idea.title)).toBeTruthy();
  for (const role of t.idea.roles) expect(idea.getByText(role)).toBeTruthy();

  expect(matcher.getByText(t.matcher.tag)).toBeTruthy();
  for (const m of t.matcher.matches) {
    expect(matcher.getByText(m.name)).toBeTruthy();
    expect(matcher.getByText(m.why)).toBeTruthy();
    expect(matcher.getAllByText(m.verified)).toHaveLength(t.matcher.matches.filter((o) => o.verified === m.verified).length);
    for (const tech of m.tech) expect(matcher.getAllByText(tech).length).toBeGreaterThan(0);
  }

  for (const m of t.team.members) expect(team.getByText(m.name)).toBeTruthy();
  for (const signed of new Set(t.team.members.map((m) => m.signed))) {
    expect(team.getAllByText(signed)).toHaveLength(t.team.members.filter((m) => m.signed === signed).length);
  }
  expect(team.getByText(t.team.agreement, { exact: false })).toBeTruthy();

  expect(hub.getByText(t.hub.sample)).toBeTruthy();
  for (const phase of t.hub.phases) expect(hub.getByText(phase)).toBeTruthy();
  // nothing has started: every phase reads Not started
  expect(hub.getAllByText(t.hub.notStarted)).toHaveLength(4);
  expect(hub.queryByText(/in progress|en cours/i)).toBeNull();
});

test("the Lagoon tag appears once in the views of a step, and the people are made up", () => {
  const { container } = render(<HowItWorks lang="en" />);
  // once inline and once on the wide-screen stage, which is hidden from screen readers
  expect(screen.getAllByText(copy.en.matcher.tag)).toHaveLength(2);
  expect(container.querySelector("[aria-hidden='true'][data-active]")).not.toBeNull();
});

test("the first step is active at first and reading a step moves the stage to its view", () => {
  const { container } = render(<HowItWorks lang="en" />);
  const steps = stepsOf(container);
  const stage = container.querySelector<HTMLElement>("[aria-hidden='true'][data-active]")!;
  const activeViews = () =>
    [...stage.querySelectorAll<HTMLElement>("[data-view]")].filter((v) => v.dataset.active === "true");

  expect(steps.map((step) => step.dataset.active)).toEqual(["true", "false", "false", "false"]);
  expect(stage.dataset.active).toBe("0");
  expect(activeViews().map((v) => v.dataset.view)).toEqual(["0"]);

  read(steps[2]);
  expect(steps.map((step) => step.dataset.active)).toEqual(["false", "false", "true", "false"]);
  expect(stage.dataset.active).toBe("2");
  expect(activeViews().map((v) => v.dataset.view)).toEqual(["2"]);

  read(steps[1]);
  expect(stage.dataset.active).toBe("1");
});

test("without IntersectionObserver the first step stays active and every step still shows", () => {
  vi.unstubAllGlobals();
  const { container } = render(<HowItWorks lang="en" />);
  expect(stepsOf(container)[0].dataset.active).toBe("true");
  expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
});
