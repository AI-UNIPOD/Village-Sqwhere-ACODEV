import { expect, test } from "vitest";

import { heroGeometry, isPhoneWidth } from "./hero-layout";

const COPY_HEIGHT = 240;
const layout = (width: number, viewportHeight = 800) =>
  heroGeometry({ width, viewportHeight, navHeight: 72, measureCopy: () => COPY_HEIGHT });

test("the square is always 32 cells wide, and the cell grows with the screen", () => {
  expect(layout(360).cell).toBe(7);
  expect(layout(390).cell).toBe(8);
  expect(layout(800).cell).toBe(9);
  expect(layout(1280).cell).toBe(14);
  expect(layout(1920).cell).toBe(16);
  for (const width of [360, 390, 800, 1280, 1920]) {
    const g = layout(width);
    expect(g.square).toBe(32 * g.cell);
  }
});

test("on a phone the text is centred above the square, clear of the floating buttons", () => {
  const g = layout(360);
  expect(isPhoneWidth(360)).toBe(true);
  expect(g.centered).toBe(true);
  expect(g.copyLeft).toBe(60);
  expect(g.copyLeft + g.copyWidth).toBe(360 - 60);
  expect(g.y).toBeGreaterThan(g.copyTop + COPY_HEIGHT);
  expect(g.x + g.square).toBeLessThanOrEqual(360);
  expect(g.height).toBeGreaterThan(g.y + g.square);
});

test("on a tablet the text stays left and the square fits inside the right margin", () => {
  const g = layout(900);
  expect(g.centered).toBe(false);
  expect(g.copyLeft).toBe(32);
  expect(g.copyWidth).toBeLessThanOrEqual(560);
  expect(g.x + g.square).toBeLessThanOrEqual(900 - 60);
  expect(g.y).toBeGreaterThan(g.copyTop + COPY_HEIGHT);
});

test("on a wide screen the text is left of the square and both sit in the 1180px column", () => {
  const g = layout(1440);
  expect(g.centered).toBe(false);
  expect(g.copyLeft).toBe(130 + 32);
  expect(g.copyLeft + g.copyWidth).toBeLessThan(g.x);
  expect(g.x + g.square).toBe(1440 - 130 - 32);
  expect(g.copyWidth).toBeLessThanOrEqual(640);
  // the text block is centred on the square
  expect(g.copyTop + COPY_HEIGHT / 2).toBeCloseTo(g.y + g.square / 2, 0);
});

test("below 1240px a wide screen keeps 60px clear at the right for the floating buttons", () => {
  const g = layout(1220);
  expect(g.x + g.square).toBeLessThanOrEqual(1220 - 60);
});

test("a tall window makes the hero fill the first screen under the header", () => {
  expect(layout(1440, 1200).height).toBe(1200 - 72);
  expect(layout(1440, 600).height).toBeGreaterThanOrEqual(32 * 16 + 14 * 16);
});

test("the text block is measured where it will sit", () => {
  const seen: Array<[number, number]> = [];
  heroGeometry({
    width: 1440,
    viewportHeight: 800,
    navHeight: 72,
    measureCopy: (left, width) => {
      seen.push([left, width]);
      return COPY_HEIGHT;
    },
  });
  expect(seen).toHaveLength(1);
  expect(seen[0][0]).toBe(162);
});
