import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { crowdFontSize, layoutCrowd } from "./gather";
import { GatherHero } from "./gather-hero";
import { heroAvoid, heroGeometry } from "./hero-layout";
import { heroTeamCopy } from "./hero-team-copy";
import { chipCentre, fittingRing, pickTeam, roomFits } from "./hero-team";
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

// a page below the phone breakpoint; `turn` crosses it, as a tablet does, and tells the hero
function stubPhone(initial: boolean) {
  let phone = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return query.includes("max-width: 767px") && phone;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
  return {
    turn(next: boolean) {
      phone = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

test("on a phone the hero is the text alone: nothing is drawn, nothing moves, no motion button", () => {
  stubPhone(true);
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  expect(section.hasAttribute("data-ready")).toBe(true);
  // nothing placed by the script: the CSS keeps the text in the flow and hides the rest
  expect(section.style.height).toBe("");
  expect(container.querySelector<HTMLElement>("section > div")!.style.cssText).toBe("");
  expect(container.querySelector<HTMLElement>("section > div[aria-hidden]")!.style.cssText).toBe("");
  expect(playButton(container).style.display).toBe("");
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

test("turning past the phone breakpoint lays the hero out, and back again clears it", () => {
  const page = stubPhone(true);
  const { container } = renderHero();
  const section = container.querySelector("section")!;
  const square = container.querySelector<HTMLElement>("section > div[aria-hidden]")!;
  page.turn(false);
  expect(section.style.height).not.toBe("");
  expect(square.style.width).not.toBe("");
  expect(playButton(container).style.display).toBe("inline-flex");
  page.turn(true);
  expect(section.style.height).toBe("");
  expect(square.style.cssText).toBe("");
  expect(playButton(container).style.display).toBe("");
});

// jsdom has no layout, so this reads the stylesheet: below the breakpoint only the text shows
test("the phone stylesheet keeps the text in the flow and hides the crowd, the square and the button", () => {
  const css = readFileSync(join(__dirname, "gather-hero.module.css"), "utf8").replace(/\s+/g, " ");
  const phone = css.slice(css.indexOf("@media (max-width: 767px) {"));
  expect(phone).toContain(".copy { position: relative;");
  expect(phone).toContain(".square, .canvas, .tree, .play { display: none; }");
  // the wait-until-placed rule is for wider screens only: a phone shows its text at once
  expect(css).toContain("@media (scripting: enabled) and (min-width: 768px) { .hero:not([data-ready]) > * { visibility: hidden; } }");
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

// ---------- your idea gathers a team ----------

type Drawn = { text: string; x: number; y: number };

// every fillText on every canvas, in order; `clear` forgets what was drawn so far
function recordText() {
  const drawn: Drawn[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = fakeContext() as Record<string, unknown>;
    ctx.fillText = (text: string, x: number, y: number) => drawn.push({ text, x, y });
    return ctx as unknown as RenderingContext;
  });
  return { drawn, clear: () => drawn.splice(0), texts: () => drawn.map((d) => d.text) };
}

// animation frames by hand: `play` runs the queued frame, 16ms at a time
function stubFrames() {
  let queue: FrameRequestCallback[] = [];
  let now = 1000;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => queue.push(callback));
  return {
    play(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += 0.016) {
        const run = queue;
        queue = [];
        now += 16;
        run.forEach((callback) => callback(now));
      }
    },
  };
}

// the hero as the tests lay it out: 1440px wide, a 240px text box with no padding
function zones() {
  const g = heroGeometry({ width: 1440, viewportHeight: window.innerHeight, navHeight: 0, copyPad: 0, measureCopy: () => 240 });
  return { g, avoid: heroAvoid(g) };
}
const inside = (x: number, y: number, [x0, y0, x1, y1]: readonly [number, number, number, number]) =>
  x > x0 && x < x1 && y > y0 && y < y1;

// the chip's width with the test's fake 6px letters: "Your idea" plus 12px of padding
const CHIP_WIDTH = "Your idea".length * 6 + 12;

// where a pointer can rest and the team gathers: clear of the boxes, room for a ring, builders near
function aRestingSpot() {
  const { g, avoid } = zones();
  const fontSize = crowdFontSize(g.cell);
  const words = layoutCrowd({ width: 1440, height: g.height, centerX: g.x + g.square / 2, centerY: g.y + g.square / 2, square: g.square, fontSize, avoid: [] });
  for (let y = 40; y < g.height; y += 8) {
    for (let x = 100; x < 1340; x += 8) {
      if (avoid.some((a) => inside(x, y, a))) continue;
      const centre = chipCentre([x, y], CHIP_WIDTH, 1440);
      const ring = fittingRing(centre, (room) => roomFits(room, 1440, g.height, avoid));
      if (ring && pickTeam(words, ring.centre, 0, 1440, true, fontSize, avoid).length >= 2) return [x, y] as const;
    }
  }
  throw new Error("no spot");
}

test("with reduced motion the story is one finished ring in a clear spot: the idea, three names, all signed", () => {
  setDriftTokens(true);
  stubMotion(true);
  const text = recordText();
  renderHero();
  setDriftTokens(false);
  const labels = text.texts();
  expect(labels).toContain("Your idea");
  expect(labels.filter((t) => t === "Signed").length).toBeGreaterThanOrEqual(2);
  // nothing is still suggesting or inviting in the one frame: it is the end of the story
  expect(labels).not.toContain("Suggested by role");
  expect(labels).not.toContain("Invitation sent");
  const { avoid } = zones();
  const chip = text.drawn.find((d) => d.text === "Your idea")!;
  expect(avoid.some((a) => inside(chip.x, chip.y, a))).toBe(false);
  for (const d of text.drawn.filter((x) => x.text === "Signed")) {
    expect(avoid.some((a) => inside(d.x, d.y, a))).toBe(false);
  }
});

test("pausing shows the same finished ring, and playing starts the story again", () => {
  setDriftTokens(true);
  const frames = stubFrames();
  const text = recordText();
  renderHero();
  frames.play(0.5);
  text.clear();
  fireEvent.click(screen.getByRole("button", { name: "Pause animation" }));
  frames.play(0.1);
  expect(text.texts().filter((t) => t === "Signed").length).toBeGreaterThanOrEqual(2);
  // it stands still: later frames draw nothing more
  text.clear();
  frames.play(1);
  expect(text.texts()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Play animation" }));
  text.clear();
  frames.play(0.1);
  expect(text.texts()).not.toContain("Signed");
  setDriftTokens(false);
});

test("nothing is drawn in the text box or the square, and the crowd shows in the band between them", () => {
  setDriftTokens(true);
  stubMotion(true);
  const text = recordText();
  renderHero();
  setDriftTokens(false);
  const { g, avoid } = zones();
  const [copy, square] = avoid;
  for (const d of text.drawn) {
    expect(avoid.some((a) => inside(d.x, d.y, a)), d.text).toBe(false);
  }
  const band = [copy[2], g.y, square[0], g.y + g.square] as const;
  expect(text.drawn.filter((d) => inside(d.x, d.y, band)).length).toBeGreaterThan(5);
});

test("the scrolling crowd's mask clears the text box, the square and the button only: the band stays crowd", () => {
  setDriftTokens(true);
  const cleared: Array<[number, number, number, number]> = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = fakeContext() as Record<string, unknown>;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillRect = (x: number, y: number, w: number, h: number) => {
      if (ctx.globalCompositeOperation === "destination-out") cleared.push([x, y, x + w, y + h]);
    };
    return ctx as unknown as RenderingContext;
  });
  renderHero();
  setDriftTokens(false);
  const { avoid } = zones();
  expect(cleared).toHaveLength(3);
  for (const rect of avoid) expect(cleared).toContainEqual(rect);
});

test("a pointer that pauses over the crowd gathers a team around the idea, in about 1.6 seconds", () => {
  setDriftTokens(true);
  stubMotion(false, true);
  const frames = stubFrames();
  const text = recordText();
  const { container } = renderHero();
  const hero = container.querySelector("section")!;
  const [x, y] = aRestingSpot();

  movePointer(hero, x, y);
  frames.play(0.2);
  text.clear();
  frames.play(0.016);
  // the chip hangs below and to the right of the pointer's tip, and nothing has gathered yet
  const chip = text.drawn.find((d) => d.text === "Your idea")!;
  expect(chip.x).toBe(x + 9 + 6);
  expect(chip.y).toBeCloseTo(y + 15.5, 6);
  expect(text.texts()).not.toContain("Suggested by role");

  // the pause is 250ms; then the matcher suggests by role and the names spring onto the ring
  frames.play(0.2);
  text.clear();
  frames.play(0.032);
  expect(text.texts()).toContain("Suggested by role");
  expect(text.texts().some((t) => ["Backend", "Mobile", "Security"].includes(t))).toBe(true);

  // 0.5s on, the invitations (one asks to join)
  frames.play(0.6);
  text.clear();
  frames.play(0.032);
  expect(text.texts().some((t) => t === "Invitation sent" || t === "Asks to join")).toBe(true);
  expect(text.texts()).not.toContain("Suggested by role");

  // 1.6s on, all signed
  frames.play(1.0);
  text.clear();
  frames.play(0.032);
  expect(text.texts().filter((t) => t === "Signed").length).toBeGreaterThanOrEqual(2);
  setDriftTokens(false);
});

test("the labels stay up while the pointer stays, and the team goes home when it moves", () => {
  setDriftTokens(true);
  stubMotion(false, true);
  const frames = stubFrames();
  const text = recordText();
  const { container } = renderHero();
  const hero = container.querySelector("section")!;
  const [x, y] = aRestingSpot();
  movePointer(hero, x, y);
  frames.play(2.6);
  // 600ms after the ring closed, and long after: still signed
  text.clear();
  frames.play(0.032);
  expect(text.texts().filter((t) => t === "Signed").length).toBeGreaterThanOrEqual(2);
  frames.play(5);
  text.clear();
  frames.play(0.032);
  expect(text.texts().filter((t) => t === "Signed").length).toBeGreaterThanOrEqual(2);

  // a small shake changes nothing
  movePointer(hero, x + 3, y + 2);
  frames.play(0.1);
  text.clear();
  frames.play(0.032);
  expect(text.texts()).toContain("Signed");

  // a real move lets them go within --dur-modal (220ms)
  movePointer(hero, x + 40, y);
  frames.play(0.3);
  text.clear();
  frames.play(0.032);
  expect(text.texts()).not.toContain("Signed");
  expect(text.texts()).toContain("Your idea");
  setDriftTokens(false);
});

test("the idea is not drawn over the text box or the square, and nothing gathers there", () => {
  setDriftTokens(true);
  stubMotion(false, true);
  const frames = stubFrames();
  const text = recordText();
  const { container } = renderHero();
  const hero = container.querySelector("section")!;
  const { g, avoid } = zones();
  // over the square, then over the text box
  for (const [px, py] of [
    [g.x + g.square / 2, g.y + g.square / 2],
    [(avoid[0][0] + avoid[0][2]) / 2, (avoid[0][1] + avoid[0][3]) / 2],
  ]) {
    movePointer(hero, px, py);
    frames.play(2);
    text.clear();
    frames.play(0.032);
    const chips = text.drawn.filter((d) => d.text === "Your idea" && Math.abs(d.x - (px + 15)) < 1);
    expect(chips).toEqual([]);
    expect(text.texts()).not.toContain("Signed");
  }
  setDriftTokens(false);
});

test("a touch screen has no pointer story: the idea does not follow a finger", () => {
  setDriftTokens(true);
  stubMotion(false, false);
  const frames = stubFrames();
  const text = recordText();
  const { container } = renderHero();
  const hero = container.querySelector("section")!;
  const [x, y] = aRestingSpot();
  movePointer(hero, x, y);
  frames.play(0.5);
  text.clear();
  frames.play(0.032);
  expect(text.drawn.filter((d) => d.text === "Your idea" && Math.abs(d.x - (x + 15)) < 1 && Math.abs(d.y - (y + 15.5)) < 1)).toEqual([]);
  setDriftTokens(false);
});

test("without a pointer a ghost idea wanders to a clear spot and tells the story, again and again", () => {
  setDriftTokens(true);
  stubMotion(false, false);
  const frames = stubFrames();
  const text = recordText();
  renderHero();
  const seen = new Set<string>();
  const { avoid } = zones();
  let rounds = 0;
  let previous = false;
  for (let i = 0; i < 40 * 62; i++) {
    text.clear();
    frames.play(0.016);
    for (const t of text.texts()) seen.add(t);
    for (const d of text.drawn.filter((x) => x.text === "Signed" || x.text === "Your idea")) {
      expect(avoid.some((a) => inside(d.x, d.y, a))).toBe(false);
    }
    const signed = text.texts().includes("Signed");
    if (signed && !previous) rounds++;
    previous = signed;
  }
  expect(seen.has("Your idea")).toBe(true);
  expect(seen.has("Suggested by role")).toBe(true);
  expect(seen.has("Signed")).toBe(true);
  expect(rounds).toBeGreaterThanOrEqual(2);
  setDriftTokens(false);
});

test("nothing the story draws claims a score or a percentage, or reads the idea", () => {
  setDriftTokens(true);
  stubMotion(false, false);
  const frames = stubFrames();
  const text = recordText();
  renderHero();
  const seen = new Set<string>();
  for (let i = 0; i < 40 * 62; i++) {
    text.clear();
    frames.play(0.016);
    for (const t of text.texts()) seen.add(t);
  }
  const story = [...seen].filter((t) => /idea|role|Invitation|Asks|Signed|Backend|Mobile|Security/.test(t));
  expect(story.length).toBeGreaterThan(3);
  for (const t of story) expect(t).not.toMatch(/\d|%|score/i);
  setDriftTokens(false);
});

test("the French page tells the story in French", () => {
  setDriftTokens(true);
  stubMotion(true);
  const text = recordText();
  render(
    <GatherHero labelledBy="title" labels={labels} team={heroTeamCopy.fr}>
      <h1 id="title">Toute l&apos;Afrique, une seule place.</h1>
    </GatherHero>,
  );
  setDriftTokens(false);
  expect(text.texts()).toContain("Votre idée");
  expect(text.texts()).toContain("Signé");
});

test("a change of theme redraws the hero at once, so the theme switch's picture of the new page has the new colours", async () => {
  // the frame loop is stubbed out above: only a draw made in answer to the change itself counts
  let drawn = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = fakeContext() as Record<string, unknown>;
    ctx.drawImage = () => (drawn += 1);
    return ctx as unknown as RenderingContext;
  });
  renderHero();
  const before = drawn;
  await act(async () => {
    document.documentElement.setAttribute("data-theme", "dark");
  });
  expect(drawn).toBeGreaterThan(before);
  document.documentElement.removeAttribute("data-theme");
});

// jsdom has no layout, so this reads the stylesheet: the motion button's 44px tap ring grows
// upward, because the hero clips anything past its bottom edge, which can sit just under it.
test("the motion button's tap ring is 44px tall and grows upward, not past the hero's bottom", () => {
  const css = readFileSync(join(__dirname, "gather-hero.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toMatch(/\.play::before \{[^}]*inset-inline: calc\(\(var\(--float-size\) - var\(--tap-min\)\) \/ 2\);[^}]*inset-block: calc\(var\(--float-size\) - var\(--tap-min\)\) 0;/);
});
