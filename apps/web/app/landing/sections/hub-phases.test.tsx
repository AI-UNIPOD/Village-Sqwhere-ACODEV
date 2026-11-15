import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { COMMITS, copy } from "./hub-phases-copy";
import { HubPhases } from "./hub-phases";

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

function scrollIntoView(el: Element) {
  act(() => {
    for (const w of watchers) {
      if (!w.targets.has(el)) continue;
      w.callback([{ target: el, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
}

function stubMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
}

// pretend the demo starts below the bottom of the screen
function belowTheFold() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => ({ top: 2000, bottom: 2400, left: 0, right: 10, width: 10, height: 400, x: 0, y: 2000 }) as DOMRect,
  );
}

beforeEach(() => {
  watchers = [];
  stubMotion(false);
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// the default text normaliser folds the French narrow no-break spaces into plain ones
const verbatim = { normalizer: (text: string) => text };

const demo = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-waiting]")!;

test.each(["en", "fr"] as const)("the %s section shows its heading and lead", (lang) => {
  const { container } = render(<HubPhases lang={lang} />);
  const t = copy[lang];
  expect(screen.getByRole("heading", { level: 2, name: t.title })).toBeTruthy();
  expect(container.querySelector("section#hub")!.getAttribute("aria-labelledby")).toBe("hub-title");
  expect(screen.getByText(t.lead, verbatim)).toBeTruthy();
  expect(screen.getByText(t.closing, verbatim)).toBeTruthy();
});

test.each(["en", "fr"] as const)("the %s tabs are the four phases, numbered, the first selected", (lang) => {
  render(<HubPhases lang={lang} />);
  const tabs = screen.getAllByRole("tab");
  expect(tabs.map((tab) => tab.textContent)).toEqual(copy[lang].phases.map((p, i) => `0${i + 1}${p.name}`));
  expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false", "false", "false"]);
  // roving tabindex: only the selected tab is in the tab order
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
  expect(screen.getByRole("tablist", { name: copy[lang].tablist })).toBeTruthy();
});

test("each tab controls a panel that it names", () => {
  render(<HubPhases lang="en" />);
  const panel = screen.getByRole("tabpanel");
  const first = screen.getAllByRole("tab")[0];
  expect(first.getAttribute("aria-controls")).toBe(panel.id);
  expect(panel.getAttribute("aria-labelledby")).toBe(first.id);
  expect(within(panel).getByText(copy.en.phases[0].text)).toBeTruthy();
});

test("a click switches the panel and the selected tab", () => {
  render(<HubPhases lang="en" />);
  const tabs = screen.getAllByRole("tab");
  fireEvent.click(tabs[2]);

  expect(tabs[2].getAttribute("aria-selected")).toBe("true");
  expect(tabs[0].getAttribute("aria-selected")).toBe("false");
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, 0, -1]);
  const panel = screen.getByRole("tabpanel");
  expect(panel.getAttribute("aria-labelledby")).toBe(tabs[2].id);
  expect(within(panel).getByText(copy.en.phases[2].text)).toBeTruthy();
  for (const commit of COMMITS) {
    expect(within(panel).getByText(commit.message)).toBeTruthy();
    expect(within(panel).getByText(commit.hash)).toBeTruthy();
  }
});

test("the arrow keys, Home and End move between tabs, and the focus goes with them", () => {
  render(<HubPhases lang="en" />);
  const tabs = screen.getAllByRole("tab");
  tabs[0].focus();

  fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
  expect(tabs[1].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs[1]);
  expect(within(screen.getByRole("tabpanel")).getByText(copy.en.phases[1].items![0])).toBeTruthy();

  fireEvent.keyDown(tabs[1], { key: "End" });
  expect(tabs[3].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs[3]);

  // it wraps round at the ends
  fireEvent.keyDown(tabs[3], { key: "ArrowRight" });
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
  expect(tabs[3].getAttribute("aria-selected")).toBe("true");

  fireEvent.keyDown(tabs[3], { key: "Home" });
  expect(tabs[0].getAttribute("aria-selected")).toBe("true");
  expect(document.activeElement).toBe(tabs[0]);
});

test("the rail marker is told which tab is selected", () => {
  const { container } = render(<HubPhases lang="en" />);
  const marker = container.querySelector<HTMLElement>("[aria-hidden='true'] > span")!;
  expect(marker.style.getPropertyValue("--sel")).toBe("0");
  fireEvent.click(screen.getAllByRole("tab")[3]);
  expect(marker.style.getPropertyValue("--sel")).toBe("3");
});

test.each(["en", "fr"] as const)("every phase shows its sample view in %s", (lang) => {
  render(<HubPhases lang={lang} />);
  const tabs = screen.getAllByRole("tab");
  copy[lang].phases.forEach((phase, i) => {
    fireEvent.click(tabs[i]);
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText(phase.view, verbatim)).toBeTruthy();
    for (const item of phase.items ?? COMMITS.map((c) => c.message)) expect(within(panel).getByText(item, verbatim)).toBeTruthy();
  });
});

test("the review checklist says each item is done", () => {
  render(<HubPhases lang="en" />);
  fireEvent.click(screen.getAllByRole("tab")[3]);
  expect(within(screen.getByRole("tabpanel")).getAllByText("Done")).toHaveLength(3);
});

test("content already on screen is never held back", () => {
  const { container } = render(<HubPhases lang="en" />);
  expect(demo(container).dataset.waiting).toBe("false");
  expect(screen.getByRole("tabpanel").dataset.live).toBe("true");
});

test("below the screen the first phase waits, then plays once when the demo scrolls into view", () => {
  belowTheFold();
  const { container } = render(<HubPhases lang="en" />);
  expect(demo(container).dataset.waiting).toBe("true");
  expect(screen.getByRole("tabpanel").dataset.live).toBe("false");

  scrollIntoView(demo(container));
  expect(demo(container).dataset.waiting).toBe("false");
  expect(screen.getByRole("tabpanel").dataset.live).toBe("true");
  // once: the observer is done
  for (const w of watchers) expect(w.targets.has(demo(container))).toBe(false);
});

test("choosing a tab before the demo has been seen plays that phase at once", () => {
  belowTheFold();
  const { container } = render(<HubPhases lang="en" />);
  fireEvent.click(screen.getAllByRole("tab")[1]);
  expect(demo(container).dataset.waiting).toBe("false");
  expect(screen.getByRole("tabpanel").dataset.live).toBe("true");
});

test("with reduced motion the final state shows at once, even below the screen", () => {
  stubMotion(true);
  belowTheFold();
  const { container } = render(<HubPhases lang="en" />);
  expect(demo(container).dataset.waiting).toBe("false");
  expect(screen.getByRole("tabpanel").dataset.live).toBe("true");
  expect(watchers.flatMap((w) => [...w.targets])).toHaveLength(0);
});

test("without IntersectionObserver the first phase shows at once", () => {
  vi.unstubAllGlobals();
  stubMotion(false);
  belowTheFold();
  const { container } = render(<HubPhases lang="en" />);
  expect(demo(container).dataset.waiting).toBe("false");
});

// Brainstorm notes and the design sketch ship (hubs/); the build and review tools do not.
test.each([
  ["en", "Brainstorm notes, the design sketch and the build tab are live", "Brainstorm notes", "latest commits", "is not built yet"],
  ["fr", "Les notes de brainstorm, le schéma de conception et l'onglet construction sont disponibles", "Notes de brainstorm", "derniers commits", "n'est pas encore construit"],
] as const)("the %s hub section says brainstorm notes, the design sketch and the build tab are live, and the review tool is still to come", (lang, live, view, notes, notBuilt) => {
  render(<HubPhases lang={lang} />);
  const t = copy[lang];
  expect(t.lead).toContain(live);
  expect(t.closing).toContain(notes);
  expect(t.closing).toContain(notBuilt);
  expect(t.phases[0].view).toBe(view);
  // the review tool is not built, and the section says so
  expect(t.lead).toMatch(/still to come|reste à venir/);
  // no label calls the views made up or a sample
  expect(`${t.lead} ${t.closing}`).not.toMatch(/made-up|sample|inventé|exemple/i);
});
