import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { crowdFontSize, layoutCrowd } from "./gather";
import { GatherHero } from "./gather-hero";
import { heroAvoid, heroGeometry } from "./hero-layout";
import { heroTeamCopy } from "./hero-team-copy";
import { MOTION_KEY } from "./motion";

let resizeCallbacks: Array<() => void> = [];
const labels = { pause: "Pause animation", play: "Play animation" };
const team = heroTeamCopy.en;

// jsdom cannot draw: a 2D context that accepts every call and draws nothing
function fakeContext() {
  const noop = () => {};
  return new Proxy(
    {
      getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4) }),
      measureText: (text: string) => ({ width: text.length * 6 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
    } as Record<string, unknown>,
    {
      get: (target, key: string) => (key in target ? target[key] : noop),
      set: (target, key: string, value) => {
        target[key] = value;
        return true;
      },
    },
  );
}

// the system's reduced-motion setting; `set` changes it and tells whoever listens, like a browser
function stubMotion(reduced: boolean, hover = false) {
  let current = reduced;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return query.includes("hover: hover") ? hover : current && query.includes("reduced-motion");
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    set(next: boolean) {
      current = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
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
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderHero(heroLabels = labels) {
  return render(
    <GatherHero labelledBy="title" labels={heroLabels} team={team}>
      <h1 id="title">Builders across Africa, one square.</h1>
    </GatherHero>,
  );
}

const logoLayer = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('svg[fill="var(--logo)"]')!.parentElement!;

// a hidden element has no accessible name, so find the hidden button by where it is
const playButton = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("section > button")!;

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
  expect(button.style.display).toBe("inline-flex");
  // the visible words are its name, and it does not claim a pressed state
  expect(button.textContent).toContain("Pause animation");
  expect(button.hasAttribute("aria-pressed")).toBe(false);
  expect(button.getAttribute("type")).toBe("button");
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

test("when the browser cannot draw, it keeps the still frame: the logo and no button, as nothing can move", () => {
  stubCanvas(false);
  const { container } = renderHero();
  expect(container.querySelector("section")!.hasAttribute("data-ready")).toBe(true);
  expect(parseFloat(logoLayer(container).style.opacity)).toBe(1);
  expect(playButton(container).style.display).toBe("none");
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

test("if placing the hero fails, it still shows the hero with the logo, not a blank space", () => {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => {
    throw new Error("layout failed");
  });
  const { container } = renderHero();
  expect(container.querySelector("section")!.hasAttribute("data-ready")).toBe(true);
  expect(parseFloat(logoLayer(container).style.opacity)).toBe(1);
  expect(playButton(container).style.display).toBe("none");
});

test("places everything again when the width changes", () => {
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  const before = section.style.height;

  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(360);
  resizeCallbacks.forEach((callback) => callback());
  expect(section.style.height).not.toBe(before);
});

// ---------- the "coming soon" line under the hero's buttons ----------

function renderHeroWithNote() {
  return render(
    <GatherHero labelledBy="title" labels={labels} team={team}>
      <h1 id="title">Builders across Africa, one square.</h1>
      <div>
        <button type="button">Try the demo</button>
        <a href="#tour">Take the tour</a>
      </div>
      <p data-hero-note="">The demo is coming soon.</p>
    </GatherHero>,
  );
}

test("the coming-soon line starts exactly where the first button starts", () => {
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === "BUTTON" ? 45 : 0;
  });
  const { container } = renderHeroWithNote();
  expect(container.querySelector<HTMLElement>("[data-hero-note]")!.style.marginLeft).toBe("45px");
});

test("the coming-soon line starts under the button it belongs to, wherever that button is", () => {
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.tagName === "BUTTON" ? 260 : 0;
  });
  const { container } = render(
    <GatherHero labelledBy="title" labels={labels} team={team}>
      <h1 id="title">Builders across Africa, one square.</h1>
      <div>
        <a href="#join">Join the village</a>
        <a href="#tour">Take the tour</a>
        <button type="button" data-note="demo-note">
          Try the demo
        </button>
      </div>
      <p id="demo-note" data-hero-note="">
        The demo is coming soon.
      </p>
    </GatherHero>,
  );
  expect(container.querySelector<HTMLElement>("[data-hero-note]")!.style.marginLeft).toBe("260px");
});

test("no background words are drawn behind the text block, the coming-soon line included", () => {
  // the line is in the block's flow: the block's height (240px here) already contains it
  const drawn: Array<[number, number]> = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = fakeContext();
    (ctx as Record<string, unknown>).fillText = (_t: string, x: number, y: number) => drawn.push([x, y]);
    return ctx as unknown as RenderingContext;
  });
  const { container } = renderHeroWithNote();
  const copy = container.querySelector<HTMLElement>("section > div")!;
  const left = parseFloat(copy.style.left);
  const right = left + parseFloat(copy.style.width);
  const top = parseFloat(copy.style.top);

  expect(drawn.length).toBeGreaterThan(100); // the crowd was drawn
  const behindTheBlock = drawn.filter(([x, y]) => x < right && x > left && y >= top - 10 && y <= top + 240);
  expect(behindTheBlock).toEqual([]);
});

// ---------- the background scroll ----------

// the drift's tokens, and the story's: the spring (--ease-strong), the signatures (--ease-out)
// and the way home (--dur-modal)
const DRIFT_TOKENS: Record<string, string> = {
  "--dur-drift": "2s",
  "--ease-linear": "linear",
  "--space-8": "32px",
  "--space-3": "12px",
  "--ease-strong": "cubic-bezier(0.16, 1, 0.3, 1)",
  "--ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",
  "--dur-modal": "220ms",
};

function setDriftTokens(on: boolean) {
  for (const [name, value] of Object.entries(DRIFT_TOKENS)) {
    if (on) document.documentElement.style.setProperty(name, value);
    else document.documentElement.style.removeProperty(name);
  }
}

// a visible word of the scrolling crowd, placed exactly as the hero places it at 1440px: the
// crowd fills the hero evenly, so pick one clear of the text, the square and the button
function aCrowdWord() {
  const g = heroGeometry({
    width: 1440,
    viewportHeight: window.innerHeight,
    navHeight: 0,
    copyPad: 0,
    measureCopy: () => 240,
  });
  const fontSize = crowdFontSize(g.cell);
  const words = layoutCrowd({
    width: 1440,
    height: g.height,
    centerX: g.x + g.square / 2,
    centerY: g.y + g.square / 2,
    square: g.square,
    fontSize,
    avoid: [],
  });
  const word = words.find((w) =>
    heroAvoid(g).every(([x0, y0, x1, y1]) => w.x + w.w <= x0 || w.x >= x1 || w.y + fontSize <= y0 || w.y >= y1),
  )!;
  return { word, fontSize };
}

function movePointer(target: Element, x: number, y: number) {
  target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }));
}

test("the background words scroll when the design system's motion tokens are there", () => {
  setDriftTokens(true);
  const { container } = renderHero();
  expect(container.querySelector("section")!.getAttribute("data-drift")).toBe("on");
  setDriftTokens(false);
});

test("resting the pointer on a background word no longer holds the drift: the team gathers instead", () => {
  setDriftTokens(true);
  stubMotion(false, true);
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  const { word, fontSize } = aCrowdWord();
  movePointer(section, word.x + word.w / 2, word.y + fontSize / 2);
  expect(section.getAttribute("data-drift")).toBe("on");
  section.dispatchEvent(new MouseEvent("pointerleave"));
  expect(section.getAttribute("data-drift")).toBe("on");
  setDriftTokens(false);
});

test("the pause button stops the drift too, for phones and keyboards that cannot hover", () => {
  setDriftTokens(true);
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
  expect(section.getAttribute("data-drift")).toBe("off");
  fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
  expect(section.getAttribute("data-drift")).toBe("on");
  setDriftTokens(false);
});

test("without the motion tokens the background words stay still instead of guessing a speed", () => {
  setDriftTokens(false);
  const { container } = renderHero();
  expect(container.querySelector("section")!.getAttribute("data-drift")).toBe("off");
});

test("the crowd is drawn twice, one hero width apart, then masked, so the loop has no seam", () => {
  setDriftTokens(true);
  const drawn: Array<{ img: HTMLCanvasElement; x: number; op: string }> = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = fakeContext() as Record<string, unknown>;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage = (img: HTMLCanvasElement, x: number) =>
      drawn.push({ img, x, op: String(ctx.globalCompositeOperation) });
    return ctx as unknown as RenderingContext;
  });
  renderHero();

  // the band at its shift and again exactly one hero width (1440px) to its right
  const band = drawn.filter((d) => d.op === "source-over" && d.img.width === 1440);
  expect(band.some((a) => band.some((b) => b.img === a.img && b.x === a.x + 1440))).toBe(true);
  // then only the mask's open areas are kept: the text, the square and the button stay clear
  expect(drawn.some((d) => d.op === "destination-in")).toBe(true);
  setDriftTokens(false);
});

test("with reduced motion the crowd is drawn once, still, laid out around the text", () => {
  setDriftTokens(true);
  stubMotion(true);
  const drawn: Array<{ x: number }> = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = fakeContext() as Record<string, unknown>;
    ctx.drawImage = (_img: unknown, x: number) => drawn.push({ x });
    return ctx as unknown as RenderingContext;
  });
  renderHero();
  expect(drawn.every((d) => d.x === 0)).toBe(true);
  setDriftTokens(false);
});

// ---------- the crowd is full width, with no fade at a frame ----------

test.each([
  ["moving", false],
  ["still", true],
])("on a wide screen the crowd has no frame fade: the mask has no gradient, %s", (_, reduced) => {
  setDriftTokens(true);
  stubMotion(reduced);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(2560);
  const gradients: number[][] = [];
  const ops: string[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = fakeContext() as Record<string, unknown>;
    ctx.globalCompositeOperation = "source-over";
    ctx.createLinearGradient = (...args: number[]) => {
      gradients.push(args);
      return { addColorStop: () => {} };
    };
    ctx.drawImage = () => ops.push(String(ctx.globalCompositeOperation));
    return ctx as unknown as RenderingContext;
  });
  renderHero();
  setDriftTokens(false);
  expect(gradients).toEqual([]);
  // only a scrolling crowd goes through the mask
  expect(ops.includes("destination-in")).toBe(!reduced);
});

// ---------- motion: the visitor's choice, else the system setting ----------

const section = (container: HTMLElement) => container.querySelector("section")!;

test("by default reduced motion is respected: still, with a visible button that offers to play", () => {
  setDriftTokens(true);
  stubMotion(true);
  const { container } = renderHero();
  expect(parseFloat(logoLayer(container).style.opacity)).toBe(1);
  expect(section(container).getAttribute("data-drift")).toBe("off");
  const button = screen.getByRole("button", { name: "Play animation" });
  expect(button.style.display).toBe("inline-flex");
  expect(localStorage.getItem(MOTION_KEY)).toBeNull();
  setDriftTokens(false);
});

test("playing despite reduced motion remembers it and starts all the motion", () => {
  setDriftTokens(true);
  stubMotion(true);
  const { container } = renderHero();
  fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
  expect(localStorage.getItem(MOTION_KEY)).toBe("on");
  expect(section(container).getAttribute("data-drift")).toBe("on");
  // the logo fades with the walking names again, so it is not simply shown
  expect(parseFloat(logoLayer(container).style.opacity)).toBeLessThan(1);
  expect(screen.getByRole("button", { name: "Pause animation" })).toBeTruthy();
  setDriftTokens(false);
});

test("pausing remembers it, and the next visit starts still", () => {
  setDriftTokens(true);
  const first = renderHero();
  fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
  expect(localStorage.getItem(MOTION_KEY)).toBe("off");
  expect(section(first.container).getAttribute("data-drift")).toBe("off");
  cleanup();

  const again = renderHero();
  expect(section(again.container).getAttribute("data-drift")).toBe("off");
  expect(parseFloat(logoLayer(again.container).style.opacity)).toBe(1);
  expect(screen.getByRole("button", { name: "Play animation" })).toBeTruthy();
  setDriftTokens(false);
});

test("a saved 'on' wins over reduced motion, a saved 'off' over no preference", () => {
  setDriftTokens(true);
  stubMotion(true);
  localStorage.setItem(MOTION_KEY, "on");
  const on = renderHero();
  expect(section(on.container).getAttribute("data-drift")).toBe("on");
  expect(screen.getByRole("button", { name: "Pause animation" })).toBeTruthy();
  cleanup();

  stubMotion(false);
  localStorage.setItem(MOTION_KEY, "off");
  const off = renderHero();
  expect(section(off.container).getAttribute("data-drift")).toBe("off");
  expect(parseFloat(logoLayer(off.container).style.opacity)).toBe(1);
  expect(screen.getByRole("button", { name: "Play animation" })).toBeTruthy();
  setDriftTokens(false);
});

test("with nothing saved, a change of the system setting is followed; a saved choice is not", () => {
  setDriftTokens(true);
  const system = stubMotion(false);
  const { container } = renderHero();
  expect(section(container).getAttribute("data-drift")).toBe("on");
  system.set(true);
  expect(section(container).getAttribute("data-drift")).toBe("off");
  expect(screen.getByRole("button", { name: "Play animation" })).toBeTruthy();
  system.set(false);
  expect(section(container).getAttribute("data-drift")).toBe("on");

  fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
  system.set(true);
  system.set(false);
  expect(section(container).getAttribute("data-drift")).toBe("off");
  setDriftTokens(false);
});

test("a choice made in another tab is followed", () => {
  setDriftTokens(true);
  const { container } = renderHero();
  localStorage.setItem(MOTION_KEY, "off");
  act(() => {
    window.dispatchEvent(new StorageEvent("storage", { key: MOTION_KEY, newValue: "off" }));
  });
  expect(section(container).getAttribute("data-drift")).toBe("off");
  expect(screen.getByRole("button", { name: "Play animation" })).toBeTruthy();
  setDriftTokens(false);
});

test("blocked storage does not break the page, and the button still works until it closes", () => {
  setDriftTokens(true);
  const blocked = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);
  const { container } = renderHero();
  expect(section(container).getAttribute("data-drift")).toBe("on");
  fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
  expect(section(container).getAttribute("data-drift")).toBe("off");
  fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
  expect(section(container).getAttribute("data-drift")).toBe("on");
  setDriftTokens(false);
});
