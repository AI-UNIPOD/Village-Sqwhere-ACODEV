import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { copy, SAMPLE_PHASE } from "./how-it-works-copy";
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

  for (const phase of t.hub.phases) expect(hub.getByText(phase)).toBeTruthy();
  // the sample hub is mid-way: the phases before the current one are done, the ones after not started
  const states = hub.getAllByRole("listitem").map((item) => item.lastElementChild!.textContent);
  expect(states).toEqual(
    t.hub.phases.map((_, i) =>
      i < SAMPLE_PHASE ? t.hub.states.done : i === SAMPLE_PHASE ? t.hub.states.inProgress : t.hub.states.notStarted,
    ),
  );
  expect(hub.getAllByText(t.hub.states.inProgress)).toHaveLength(1);

  // each match shows a country, not a city
  for (const m of t.matcher.matches) expect(matcher.getByText(m.country)).toBeTruthy();
  expect(idea.getByText(t.idea.sharedBy)).toBeTruthy();
  expect(t.idea.sharedBy.endsWith("Nigeria")).toBe(true);
});

test("the Lagoon tag appears once in the views of a step", () => {
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

test.each([
  ["en", "brainstorm notes, a design sketch, a build tab and a review checklist", "Each phase has its tool"],
  ["fr", "des notes de brainstorm, un schéma de conception, un onglet construction et une liste de revue", "Chaque phase a son outil"],
] as const)("the %s hub step names the tool of each phase", (lang, notes, later) => {
  const text = copy[lang].steps[3].text;
  expect(text).toContain(notes);
  expect(text).toContain(later);
});

// New hubs sign version 2 of the hub agreement (#195), so the sample team shows it.
test.each(["en", "fr"] as const)("the %s sample team shows version 2 of the hub agreement", (lang) => {
  expect(copy[lang].team.agreement).toMatch(/^Version 2 /);
});

// ---------- phones: the stack of cards ----------

const phone = (motion: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      // the stack asks for a phone width and motion in one query
      matches: query.includes("max-width: 767px") && motion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );

test("on a phone with motion allowed the steps stack as cards, each knowing its place and height", () => {
  phone(true);
  const { container } = render(<HowItWorks lang="en" />);
  const list = container.querySelector("ol")!;
  expect(list.hasAttribute("data-stack")).toBe(true);
  stepsOf(container).forEach((step, i) => {
    expect(step.style.getPropertyValue("--i")).toBe(String(i));
    // jsdom has no layout, so every height reads 0px; a browser writes the real one
    expect(step.style.getPropertyValue("--h")).toBe("0px");
  });
  vi.unstubAllGlobals();
});

test("with reduced motion the steps stay a plain list of cards, with nothing stacked", () => {
  phone(false);
  const { container } = render(<HowItWorks lang="en" />);
  expect(container.querySelector("ol")!.hasAttribute("data-stack")).toBe(false);
  for (const step of stepsOf(container)) expect(step.style.getPropertyValue("--h")).toBe("");
  vi.unstubAllGlobals();
});

// jsdom has no layout, so this reads the stylesheet: the cards stick only inside the phone
// query and only once the script has said so; a card taller than the screen settles once its
// bottom is in view.
test("the stack's cards stick only on phones, under the pill, cascading and never cut off", () => {
  const css = readFileSync(join(__dirname, "how-it-works.module.css"), "utf8").replace(/\s+/g, " ");
  const phoneCss = css.slice(css.indexOf("@media (max-width: 767px) {"));
  expect(phoneCss).toMatch(/\.steps\[data-stack\] \.step \{ position: sticky; top: min\( calc\(var\(--stack-top\) \+ var\(--i, 0\) \* var\(--space-3\)\), calc\(100svh - var\(--h, 0px\) - var\(--space-4\)\) \);/);
  // the only stacking rule is the phone one
  expect(css.indexOf(".steps[data-stack] .step { position: sticky")).toBeGreaterThan(
    css.indexOf("@media (max-width: 767px) {"),
  );
  expect(css.split(".steps[data-stack] .step { position: sticky")).toHaveLength(2);
});
