import { runInNewContext } from "node:vm";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { THEME_INIT_SCRIPT, THEME_KEY } from "./theme";
import { ThemeButton } from "./theme-toggle";

function stubSystemTheme(dark: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query.includes("dark"),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const labels = { toDark: "Switch to dark mode", toLight: "Switch to light mode" };

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("offers dark mode on a light system and light mode on a dark one", () => {
  stubSystemTheme(false);
  render(<ThemeButton {...labels} className="theme" />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  cleanup();

  stubSystemTheme(true);
  render(<ThemeButton {...labels} className="theme" />);
  expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
});

test("switches theme, saves the choice and changes its label", () => {
  stubSystemTheme(false);
  render(<ThemeButton {...labels} className="theme" />);

  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");

  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
});

test("a chosen theme wins over the system setting", () => {
  stubSystemTheme(true);
  document.documentElement.setAttribute("data-theme", "light");
  render(<ThemeButton {...labels} className="theme" />);
  expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
});

test("still switches when the browser refuses to save the choice", () => {
  stubSystemTheme(false);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  render(<ThemeButton {...labels} className="theme" />);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
});

// ---------- the wave of tiles ----------

type Pending = { ready: () => void; finish: () => void; done: boolean };

// A stand-in for document.startViewTransition: the update runs at once, and the test decides when
// each transition becomes ready and when it finishes.
function stubTransitions() {
  const pending: Pending[] = [];
  const start = vi.fn((update: () => void) => {
    update();
    let ready = () => {};
    let finish = () => {};
    const readyPromise = new Promise<void>((resolve) => (ready = resolve));
    const finished = new Promise<void>((resolve) => (finish = resolve));
    pending.push({ ready, finish, done: false });
    return { ready: readyPromise, finished };
  });
  Object.assign(document, { startViewTransition: start });
  return { start, pending };
}

async function finishAll(pending: Pending[]) {
  for (let round = 0; round < 10; round++) {
    const open = pending.filter((t) => !t.done);
    if (!open.length) return;
    for (const t of open) {
      t.done = true;
      t.ready();
      t.finish();
    }
    await act(async () => {});
  }
}

function stubMedia({ dark = false, reduce = false }: { dark?: boolean; reduce?: boolean } = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: (dark && query.includes("dark")) || (reduce && query.includes("reduce")),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

// a running wave animation, as the page would hand back
function stubAnimate() {
  const animation = {
    effect: { getComputedTiming: () => ({ progress: 0.4 }) },
    currentTime: 100,
    playbackRate: 1,
    updatePlaybackRate: vi.fn(),
  };
  const animate = vi.fn<(keyframes: object, options: object) => typeof animation>(() => animation);
  Object.assign(document.documentElement, { animate });
  return { animate, animation };
}

const fakeContext = {
  fillStyle: "",
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  fill: vi.fn(),
};

const waveCanvas = () => document.querySelector("canvas[data-theme-tiles-canvas]");
const pressButton = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeContext as never);
  vi.stubGlobal("CSS", { supports: () => true });
});

afterEach(() => {
  const root = document.documentElement;
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  delete (root as { animate?: unknown }).animate;
  root.style.removeProperty("--dur-moment");
  for (const name of ["data-theme-tiles", "data-theme-fade"]) root.removeAttribute(name);
  document.querySelectorAll("canvas").forEach((c) => c.remove());
});

test("the new theme arrives in a wave of tiles over a canvas, which goes when the transition ends", async () => {
  const { start, pending } = stubTransitions();
  const { animate } = stubAnimate();
  stubMedia();
  vi.stubGlobal("devicePixelRatio", 3);
  render(<ThemeButton {...labels} className="theme" />);
  pressButton("Switch to dark mode");

  expect(start).toHaveBeenCalledOnce();
  const root = document.documentElement;
  expect(root.getAttribute("data-theme")).toBe("dark");
  expect(root.hasAttribute("data-theme-tiles")).toBe(true);
  // the wave starts at the centre of the visible screen, not at the button
  expect(root.style.getPropertyValue("--tiles-x")).toBe(`${window.innerWidth / 2}px`);
  expect(root.style.getPropertyValue("--tiles-y")).toBe(`${window.innerHeight / 2}px`);
  const canvas = waveCanvas() as HTMLCanvasElement;
  expect(canvas.getAttribute("aria-hidden")).toBe("true");
  // a pixel ratio of 3 is drawn at 2
  expect(canvas.width).toBe(window.innerWidth * 2);
  expect(canvas.style.width).toBe(`${window.innerWidth}px`);

  pending[0].ready();
  await act(async () => {});
  expect(animate).toHaveBeenCalledOnce();
  expect(animate.mock.calls[0][0]).toMatchObject({ "--tiles-s": ["0px", expect.stringMatching(/px$/)] });
  expect(animate.mock.calls[0][1]).toMatchObject({
    easing: expect.stringMatching(/^linear\(/),
    pseudoElement: "::view-transition-new(root)",
  });

  await finishAll(pending);
  expect(waveCanvas()).toBeNull();
  expect(root.hasAttribute("data-theme-tiles")).toBe(false);
  expect(root.style.getPropertyValue("--tiles-x")).toBe("");
});

test.each([
  [".52s", 780],
  ["520ms", 780],
  [".4s", 600],
])("the wave lasts one and a half --dur-moment, read with its unit: %s is %i ms", async (written, expected) => {
  document.documentElement.style.setProperty("--dur-moment", written);
  const { pending } = stubTransitions();
  const { animate } = stubAnimate();
  stubMedia();
  render(<ThemeButton {...labels} className="theme" />);
  pressButton("Switch to dark mode");
  pending[0].ready();
  await act(async () => {});
  expect(animate.mock.calls[0][1]).toMatchObject({ duration: expected });
  await finishAll(pending);
});

test("with reduced motion the theme crossfades and no tiles are drawn", async () => {
  const { start, pending } = stubTransitions();
  const { animate } = stubAnimate();
  stubMedia({ reduce: true });
  render(<ThemeButton {...labels} className="theme" />);
  pressButton("Switch to dark mode");

  // a short crossfade, never an instant flip: the transition runs, with nothing travelling
  expect(start).toHaveBeenCalledOnce();
  const root = document.documentElement;
  expect(root.getAttribute("data-theme")).toBe("dark");
  expect(root.hasAttribute("data-theme-fade")).toBe(true);
  expect(root.hasAttribute("data-theme-tiles")).toBe(false);
  expect(waveCanvas()).toBeNull();
  await finishAll(pending);
  expect(animate).not.toHaveBeenCalled();
  expect(root.hasAttribute("data-theme-fade")).toBe(false);
});

test("without view transitions the theme changes at once, with nothing drawn", () => {
  stubMedia();
  render(<ThemeButton {...labels} className="theme" />);
  pressButton("Switch to dark mode");
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  expect(document.documentElement.hasAttribute("data-theme-tiles")).toBe(false);
  expect(waveCanvas()).toBeNull();
});

test("without CSS linear() easings the wave cannot be timed, so the theme changes at once", () => {
  const { start } = stubTransitions();
  vi.stubGlobal("CSS", { supports: () => false });
  stubMedia();
  render(<ThemeButton {...labels} className="theme" />);
  pressButton("Switch to dark mode");
  expect(start).not.toHaveBeenCalled();
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
});

test("three fast presses end opposite to where they began, in one transition", async () => {
  const { start, pending } = stubTransitions();
  const { animation } = stubAnimate();
  stubMedia();
  render(<ThemeButton {...labels} className="theme" />);
  pressButton("Switch to dark mode");
  pending[0].ready();
  await act(async () => {});

  // the button shows each press at once, while the first change is still running
  expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Switch to light mode");
  pressButton("Switch to light mode");
  expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Switch to dark mode");
  pressButton("Switch to dark mode");
  expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Switch to light mode");
  // the running wave hurries to the end
  expect(animation.updatePlaybackRate).toHaveBeenCalledWith(4);

  await finishAll(pending);
  expect(start).toHaveBeenCalledTimes(1);
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Switch to light mode");
});

test("two fast presses play the way back after the first wave, and no more than two", async () => {
  const { start, pending } = stubTransitions();
  stubAnimate();
  stubMedia();
  render(<ThemeButton {...labels} className="theme" />);
  pressButton("Switch to dark mode");
  pressButton("Switch to light mode");
  expect(start).toHaveBeenCalledTimes(1);
  await finishAll(pending);
  expect(start).toHaveBeenCalledTimes(2);
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  expect(localStorage.getItem(THEME_KEY)).toBe("light");
  expect(screen.getByRole("button").getAttribute("aria-label")).toBe("Switch to dark mode");
});

function box(left: number, right: number) {
  return { left, right, top: 0, bottom: 100, width: right - left, height: 100 } as DOMRect;
}

test("a click Chrome sends to the page during a transition is queued when it lands on the button", async () => {
  const { start, pending } = stubTransitions();
  stubAnimate();
  stubMedia();
  render(<ThemeButton {...labels} className="theme" />);
  const button = screen.getByRole("button");
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(box(900, 944));
  pressButton("Switch to dark mode");

  // beside the button: nothing happens
  fireEvent.click(document.documentElement, { clientX: 400, clientY: 30 });
  expect(button.getAttribute("aria-label")).toBe("Switch to light mode");
  // on the button: queued, and the label turns back at once
  fireEvent.click(document.documentElement, { clientX: 920, clientY: 30 });
  expect(button.getAttribute("aria-label")).toBe("Switch to dark mode");
  // a press that reaches the button itself, as a key press does, queues too
  fireEvent.click(button);
  expect(button.getAttribute("aria-label")).toBe("Switch to light mode");

  await finishAll(pending);
  expect(start).toHaveBeenCalledTimes(1);
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
});

test("stops catching clicks on the page once the queue is empty", async () => {
  const { start, pending } = stubTransitions();
  stubAnimate();
  stubMedia();
  render(<ThemeButton {...labels} className="theme" />);
  vi.spyOn(screen.getByRole("button"), "getBoundingClientRect").mockReturnValue(box(0, 100));
  pressButton("Switch to dark mode");
  await finishAll(pending);
  fireEvent.click(document.documentElement, { clientX: 50, clientY: 50 });
  expect(start).toHaveBeenCalledTimes(1);
});

test("keeps both icons hidden from screen readers", () => {
  stubSystemTheme(false);
  const { container } = render(<ThemeButton {...labels} className="theme" />);
  const icons = container.querySelectorAll("svg");
  expect(icons).toHaveLength(2);
  for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
});

// runs the early script in an empty sandbox that has only a fake page and a fake storage
function runInitScript(read: () => string | null) {
  const attributes: Record<string, string> = {};
  runInNewContext(THEME_INIT_SCRIPT, {
    localStorage: { getItem: read },
    document: { documentElement: { setAttribute: (k: string, v: string) => (attributes[k] = v) } },
  });
  return attributes;
}

test("the early script applies a saved theme and ignores anything else", () => {
  expect(runInitScript(() => "dark")).toEqual({ "data-theme": "dark" });
  expect(runInitScript(() => "light")).toEqual({ "data-theme": "light" });
  expect(runInitScript(() => "purple")).toEqual({});
  expect(runInitScript(() => null)).toEqual({});
});

test("the early script does nothing when storage is blocked", () => {
  const blocked = () => {
    throw new Error("denied");
  };
  expect(runInitScript(blocked)).toEqual({});
});

// ---------- the tooltip ----------

const tooltipOf = (host: HTMLElement) => host.querySelector("[data-tooltip]")?.textContent;

test("names what a tap does in a tooltip that follows the label", () => {
  stubSystemTheme(false);
  render(<ThemeButton {...labels} className="theme" />);
  const button = screen.getByRole("button");
  expect(tooltipOf(button)).toBe("Switch to dark mode");
  fireEvent.click(button);
  expect(tooltipOf(button)).toBe("Switch to light mode");
});

test("says it in French on the French page", () => {
  stubSystemTheme(false);
  render(<ThemeButton toDark="Passer en mode sombre" toLight="Passer en mode clair" className="theme" />);
  expect(tooltipOf(screen.getByRole("button"))).toBe("Passer en mode sombre");
});
