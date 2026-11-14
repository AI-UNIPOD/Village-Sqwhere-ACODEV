import { expect, test, vi } from "vitest";

import { cubicBezier } from "./gather";
import { createTilePlan, FLIP_SHARE, tileColours, type TileContext } from "./theme-tiles";

const strong = cubicBezier([0.16, 1, 0.3, 1]);
const out = cubicBezier([0.23, 1, 0.32, 1]);

function plan(over: Partial<Parameters<typeof createTilePlan>[0]> = {}) {
  return createTilePlan({
    width: 1440,
    height: 900,
    origin: { x: 720, y: 450 },
    pitch: 80,
    duration: 780,
    strong,
    flipEase: out,
    ...over,
  });
}

test("the wave reaches the rings in order, the last one before the run ends", () => {
  const { ringStart, diamond } = plan();
  expect(ringStart[0]).toBeCloseTo(0, 1);
  for (let m = 1; m < ringStart.length; m++) expect(ringStart[m]).toBeGreaterThan(ringStart[m - 1]);
  const flip = Math.round(780 * FLIP_SHARE);
  // the last ring starts its flip in time to be flat when the run ends
  expect(ringStart[ringStart.length - 1] + flip).toBeLessThanOrEqual(780);
  // the diamond stays inside the finished tiles: it only grows once a ring has finished
  expect(diamond(0)).toBe(0);
  expect(diamond(flip)).toBe(0);
});

test("the diamond's easing runs from 0 to 1, never backwards, and ends the run on 1", () => {
  const { easing, diamond, reach } = plan();
  expect(easing.startsWith("linear(0.00000 0.000%")).toBe(true);
  expect(easing.endsWith("1 100%)")).toBe(true);
  const values = [...easing.matchAll(/([\d.]+) [\d.]+%/g)].map((m) => Number(m[1]));
  for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  expect(Math.max(...values)).toBe(1);
  expect(diamond(780) / reach).toBeCloseTo(1, 1);
});

test("a diamond that has covered the screen leaves no tile to draw", () => {
  const { collect } = plan();
  expect(collect(1, 780).count).toBe(0);
  // and before the wave starts there is nothing either
  expect(collect(0, 0).count).toBe(0);
});

test("the tiles in a frame all lie outside the diamond", () => {
  const p = plan();
  const t = 330;
  const progress = p.diamond(t) / p.reach;
  const frame = p.collect(progress, t);
  expect(frame.count).toBeGreaterThan(0);
  const s = progress * p.reach;
  // a tile centred in ring m lies m pitches away along the grid, so no polygon may sit deeper
  // inside than the last finished ring
  for (const points of frame.levels) {
    for (let q = 0; q < points.length; q += 8) {
      let cx = 0;
      let cy = 0;
      for (let k = 0; k < 8; k += 2) {
        cx += points[q + k] / 4;
        cy += points[q + k + 1] / 4;
      }
      expect(Math.abs(cx - 720) + Math.abs(cy - 450)).toBeGreaterThanOrEqual(s - 80);
    }
  }
});

test("the canvas clips out the diamond before it fills anything, and fills only what is outside", () => {
  const p = plan();
  const order: string[] = [];
  const ctx = {
    fillStyle: "",
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(() => order.push("rect")),
    moveTo: vi.fn(() => order.push("move")),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn((rule?: string) => order.push(`clip ${rule}`)),
    fill: vi.fn(() => order.push("fill")),
  } satisfies TileContext;
  const t = 400;
  const colours = tileColours("bg", "text", true);
  const drawn = p.draw(ctx, p.diamond(t) / p.reach, t, colours);
  expect(drawn).toBeGreaterThan(0);
  // the screen, then the diamond cut out of it (even-odd), and only then the fills
  expect(order.slice(0, 3)).toEqual(["rect", "move", "clip evenodd"]);
  expect(order.indexOf("fill")).toBeGreaterThan(order.indexOf("clip evenodd"));
  expect(ctx.save).toHaveBeenCalledOnce();
  expect(ctx.restore).toHaveBeenCalledOnce();
});

test("an early frame has no diamond to cut out yet, but still draws its tiles", () => {
  const p = plan();
  const ctx = {
    fillStyle: "",
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
  } satisfies TileContext;
  const t = p.ringStart[2] + 10;
  expect(p.draw(ctx, 0, t, tileColours("bg", "text", true))).toBeGreaterThan(0);
  expect(ctx.fill).toHaveBeenCalled();
});

test("tiles are a narrower pitch on a phone and the wave still ends on a fully covered screen", () => {
  const p = plan({ width: 390, height: 844, origin: { x: 195, y: 422 }, pitch: 48 });
  expect(p.collect(1, 780).count).toBe(0);
  expect(p.reach).toBeGreaterThan(Math.hypot(195, 422));
});

test("the shades are mixes of the background and the text colour, or the background alone", () => {
  const colours = tileColours("var-bg", "var-text", true);
  expect(colours.plain).toBe("var-bg");
  expect(colours.shades).toEqual([
    "color-mix(in srgb, var-bg, var-text 3%)",
    "color-mix(in srgb, var-bg, var-text 6%)",
    "color-mix(in srgb, var-bg, var-text 9%)",
    "color-mix(in srgb, var-bg, var-text 12%)",
  ]);
  expect(tileColours("var-bg", "var-text", false).shades).toEqual(["var-bg", "var-bg", "var-bg", "var-bg"]);
});
