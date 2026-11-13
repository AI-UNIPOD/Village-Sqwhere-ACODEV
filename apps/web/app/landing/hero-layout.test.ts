import { expect, test } from "vitest";

import { GAP, WIDE_GAP, heroAvoid, heroFrameWidth, heroGeometry } from "./hero-layout";

const COPY_HEIGHT = 240;
const PAD = 32;
const layout = (width: number, viewportHeight = 800, copyPad = PAD, playWidth?: number) =>
  heroGeometry({
    width,
    viewportHeight,
    navHeight: 72,
    copyPad,
    playWidth,
    measureCopy: () => COPY_HEIGHT,
  });

// the box and the square never overlap, however the two are arranged
function apart(g: ReturnType<typeof layout>) {
  const copy = [g.copyLeft, g.copyTop, g.copyLeft + g.copyWidth, g.copyTop + g.copyHeight];
  const sq = [g.x, g.y, g.x + g.square, g.y + g.square];
  return copy[2] <= sq[0] || sq[2] <= copy[0] || copy[3] <= sq[1] || sq[3] <= copy[1];
}

// the headline's size next to the square: the box minus its padding, over the measure
const headline = (g: ReturnType<typeof layout>, pad = PAD) => (g.copyWidth - 2 * pad) / 12.1;

test("the square is always 32 cells wide; stacked it grows with the screen", () => {
  expect(layout(360).cell).toBe(7);
  expect(layout(390).cell).toBe(8);
  expect(layout(800).cell).toBe(9);
  for (const width of [360, 390, 800, 1000, 1180, 1280, 1440, 1920]) {
    const g = layout(width);
    expect(g.square).toBe(32 * g.cell);
  }
});

// the headline size the picker aims for: 48px, or 85% of the fluid size when that is more
const target = (width: number) => {
  const fluid = Math.min(80, Math.max(36, 19.2 + 0.026 * width));
  return Math.min(fluid, Math.max(48, 0.85 * fluid));
};

test("side by side the square is sized to the text: the biggest cell that keeps the headline at its target", () => {
  // the cell the screen alone would give is 14 at 1280 and 16 from 1440, but the headline wins
  expect(layout(1280).cell).toBe(13);
  expect(layout(1440).cell).toBe(13);
  expect(layout(1180).cell).toBe(12);
  // on big screens the frame is wider, so the square and the headline grow with it
  expect(layout(1920, 1080).cell).toBe(16);
  expect(layout(2560, 1440).cell).toBe(20);
  for (const [width, height] of [
    [1180, 800],
    [1280, 800],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
    [3440, 1440],
  ]) {
    const g = layout(width, height);
    // a bigger cell would take the headline under its target (within the 0.1px slack)
    expect(headline(g)).toBeGreaterThanOrEqual(target(width) - 0.1 - 1e-9);
  }
  // at the smallest side by side cell the headline is left with what the box gives it
  expect(layout(1100).cell).toBe(11);
  const narrow = layout(1060);
  expect(narrow.stacked).toBe(false);
  expect(narrow.cell).toBe(11);
  expect(headline(narrow)).toBeGreaterThanOrEqual(42);
  expect(headline(narrow)).toBeLessThan(48);
});

test("stacked, the text box and the square are both centred, with equal space left and right", () => {
  for (const width of [360, 414, 600, 768, 900, 1000]) {
    const g = layout(width);
    expect(g.stacked).toBe(true);
    expect(g.centered).toBe(true);
    expect(g.copyLeft).toBe(width - (g.copyLeft + g.copyWidth));
    expect(Math.abs(g.x - (width - (g.x + g.square)))).toBeLessThanOrEqual(1);
    // the square is under the text, never beside it
    expect(g.y).toBeGreaterThan(g.copyTop + COPY_HEIGHT);
    expect(apart(g)).toBe(true);
    expect(g.height).toBeGreaterThan(g.y + g.square);
  }
});

test("on a phone the text stays 60px clear of the floating buttons, padding included in the box", () => {
  const g = layout(360, 800, 20);
  // the text starts 60px in; the box reaches out by its 20px padding
  expect(g.copyLeft + 20).toBe(60);
  expect(g.copyLeft + g.copyWidth - 20).toBe(360 - 60);
  expect(g.x + g.square).toBeLessThanOrEqual(360);
});

test("side by side only while the headline keeps 42px, otherwise it stacks", () => {
  const need = 42 * 12.1 + 2 * PAD;
  for (const width of [1100, 1199, 1200, 1280, 1440, 1920, 2560]) {
    const g = layout(width);
    expect(g.stacked).toBe(false);
    expect(g.copyWidth).toBeGreaterThanOrEqual(need);
    // never wider than the largest headline (80px) needs
    expect(g.copyWidth).toBeLessThanOrEqual(12.1 * 80 + 2 * PAD + 1e-9);
    expect(g.copyLeft + g.copyWidth).toBeLessThan(g.x);
    expect(g.x + g.square).toBeLessThanOrEqual(width - 60);
    expect(apart(g)).toBe(true);
  }
  expect(layout(1000).stacked).toBe(true);
  expect(layout(800).stacked).toBe(true);
});

test("the switch from stacked to side by side is one width, with a 32px box padding", () => {
  const modes = [];
  for (let width = 900; width <= 1300; width++) modes.push(layout(width).stacked);
  const switchAt = 900 + modes.indexOf(false);
  // stacked below it, side by side from it, and never back
  expect(modes.slice(0, switchAt - 900).every(Boolean)).toBe(true);
  expect(modes.slice(switchAt - 900).some(Boolean)).toBe(false);
  expect(switchAt).toBeGreaterThanOrEqual(1000);
  expect(switchAt).toBeLessThanOrEqual(1060);
});

test("side by side, the box's right edge is exactly 64px from the square, on both sides of the switch", () => {
  expect(GAP).toBe(64);
  for (const width of [1060, 1100, 1180, 1280, 1440, 1920]) {
    const g = layout(width, 1080);
    expect(g.stacked).toBe(false);
    expect(g.cell).toBeLessThan(20);
    expect(g.x - (g.copyLeft + g.copyWidth)).toBe(64);
  }
});

test("with cells of 20px the gap steps up to 80px, a token step", () => {
  expect(WIDE_GAP).toBe(80);
  for (const width of [2560, 3440]) {
    const g = layout(width, 1440);
    expect(g.cell).toBe(20);
    expect(g.x - (g.copyLeft + g.copyWidth)).toBe(80);
  }
});

test("the hero frame is 1180px up to about 1640px wide, then 72% of the width, up to 1760px", () => {
  for (const width of [1280, 1440, 1600]) expect(heroFrameWidth(width)).toBe(1180);
  expect(heroFrameWidth(1920)).toBe(1382);
  expect(heroFrameWidth(2560)).toBe(1760);
  expect(heroFrameWidth(3440)).toBe(1760);
  for (const [width, frame] of [
    [1280, 1180],
    [1440, 1180],
    [1920, 1382],
    [2560, 1760],
    [3440, 1760],
  ]) {
    const g = layout(width, 1080);
    expect(Math.abs(g.frameRight - g.frameLeft - frame)).toBeLessThanOrEqual(1);
    expect(g.frameLeft + (g.frameRight - g.frameLeft) / 2).toBeCloseTo(width / 2, 0);
    // the text starts at the frame's edge plus its side padding: where the header's logo is
    expect(g.copyLeft + PAD).toBe(g.frameLeft + 32);
  }
});

test("the square and the headline at 1920x1080, 2560x1440 and 3440x1440", () => {
  const a = layout(1920, 1080);
  expect(a.cell).toBe(16);
  expect(a.square).toBe(512);
  expect(headline(a)).toBeCloseTo(58.7, 1);
  const b = layout(2560, 1440);
  expect(b.cell).toBe(20);
  expect(b.square).toBe(640);
  expect(headline(b)).toBeCloseTo(78, 0);
  // 3440 is the same composition as 2560, centred
  const c = layout(3440, 1440);
  expect(c.cell).toBe(20);
  expect(c.copyWidth).toBe(b.copyWidth);
  expect(c.copyLeft - b.copyLeft).toBe((3440 - 2560) / 2);
  expect(c.x - b.x).toBe((3440 - 2560) / 2);
});

test("1280x800 and 1440x900 are as they were: cell 13, headline 49.9px, a 1180px frame", () => {
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
  ]) {
    const g = layout(width, height);
    expect(g.cell).toBe(13);
    expect(headline(g)).toBeCloseTo(49.9, 0);
    expect(g.x - (g.copyLeft + g.copyWidth)).toBe(64);
    expect(g.frameRight - g.frameLeft).toBe(1180);
  }
});

test("a short window limits how far the square grows past the screen's own cap", () => {
  // 2560 wide would give 20px cells; 62% of the room under the header allows fewer here
  const short = layout(2560, 900);
  expect(short.cell).toBe(Math.floor((0.62 * (900 - 72)) / 32));
  expect(short.cell).toBeLessThan(20);
  // never below what the screen alone gives: a short window does not shrink a laptop's square
  expect(layout(1440, 600).cell).toBe(layout(1440, 1200).cell);
  expect(layout(1920, 600).cell).toBe(layout(1920, 1200).cell);
});

test("stacked, the square is exactly 64px under the box's bottom edge, at every width", () => {
  for (const width of [320, 360, 414, 600, 768, 1000, 1024]) {
    const g = layout(width, 800, width < 600 ? 20 : PAD);
    expect(g.stacked).toBe(true);
    expect(g.y - (g.copyTop + g.copyHeight)).toBe(64);
  }
  // a taller box (a note that wraps) moves the square down by as much
  const tall = heroGeometry({
    width: 768,
    viewportHeight: 800,
    navHeight: 72,
    copyPad: PAD,
    measureCopy: () => COPY_HEIGHT + 20,
  });
  expect(tall.y - (tall.copyTop + tall.copyHeight)).toBe(64);
});

test("the headline measure comes from the token, so a longer measure stacks sooner", () => {
  const at = (measure: number) =>
    heroGeometry({
      width: 1100,
      viewportHeight: 800,
      navHeight: 72,
      copyPad: PAD,
      measure,
      measureCopy: () => COPY_HEIGHT,
    });
  expect(at(12.1).stacked).toBe(false);
  expect(at(14).stacked).toBe(true);
});

test("on a wide screen the text and the square sit in the hero's frame", () => {
  const g = layout(1440);
  expect(g.centered).toBe(false);
  // the text itself starts where the section text starts; the box reaches out by its padding
  expect(g.copyLeft + PAD).toBe(130 + 32);
  expect(g.x + g.square).toBe(1440 - 130 - 32);
  expect(g.frameLeft).toBe(130);
  expect(g.frameRight).toBe(1440 - 130);
  expect(g.copyLeft).toBeGreaterThanOrEqual(g.frameLeft);
  // the text block is centred on the square
  expect(g.copyTop + COPY_HEIGHT / 2).toBeCloseTo(g.y + g.square / 2, 0);
});

test("below the content width the frame is the whole width", () => {
  const g = layout(1000);
  expect(g.frameLeft).toBe(0);
  expect(g.frameRight).toBe(1000);
});

test("below 1240px a wide screen keeps 60px clear at the right for the floating buttons", () => {
  const g = layout(1220);
  expect(g.x + g.square).toBeLessThanOrEqual(1220 - 60);
});

test("a tall window makes the hero fill the first screen under the header", () => {
  expect(layout(1440, 1200).height).toBe(1200 - 72);
  const g = layout(1440, 600);
  expect(g.height).toBeGreaterThanOrEqual(g.square + 14 * g.cell);
});

test("puts the motion button 12px under the square: at its left edge, centred on its width when stacked", () => {
  const phone = layout(360, 800, 20, 200);
  expect(phone.playX).toBe(Math.round(phone.x + phone.square / 2 - 100));
  expect(phone.playWidth).toBe(200);
  expect(phone.playY).toBe(phone.y + phone.square + 12);
  const tablet = layout(768, 800, PAD, 150);
  expect(tablet.playX).toBe(Math.round(tablet.x + tablet.square / 2 - 75));
  const wide = layout(1440, 800, PAD, 180);
  expect(wide.playX).toBe(wide.x);
  expect(wide.playY).toBe(wide.y + wide.square + 12);
  // before it is measured the button is the 36px round one
  expect(layout(1440).playWidth).toBe(36);
});

test("keeps the crowd clear of the text box, the square and the real motion button", () => {
  const g = layout(1440, 800, PAD, 180);
  const [copy, square, button] = heroAvoid(g);
  expect(copy[0]).toBeLessThan(g.copyLeft);
  expect(copy[2]).toBeGreaterThan(g.copyLeft + g.copyWidth);
  expect(copy[3]).toBeGreaterThan(g.copyTop + COPY_HEIGHT);
  expect(square[2]).toBeGreaterThan(g.x + g.square);
  // the button's own rectangle (its width, 36px high) plus 8px all round
  expect(button).toEqual([g.playX - 8, g.playY - 8, g.playX + 180 + 8, g.playY + 36 + 8]);
});

test("the crowd runs full width: nothing beside the frame is kept clear, at any width", () => {
  // box, square, button and the gap between box and square: no side areas
  for (const width of [1100, 1440, 1920, 2560, 3440]) {
    const g = layout(width, 1080);
    const areas = heroAvoid(g);
    expect(areas).toHaveLength(4);
    // none is a full-height band at a side of the hero
    for (const [, y0, , y1] of areas) expect(y1 - y0).toBeLessThan(g.height);
  }
});

test("side by side, the gap between the text box and the square stays clear of the crowd", () => {
  for (const width of [1100, 1440]) {
    const g = layout(width);
    expect(heroAvoid(g)).toContainEqual([g.copyLeft + g.copyWidth, g.y - g.cell, g.x, g.y + g.square + g.cell]);
  }
  // stacked, the band between the two is full rows of crowd, not a strip, so it stays open
  const s = layout(768);
  expect(heroAvoid(s)).toHaveLength(3);
});

test("the text box is measured where it will sit, and told whether it is stacked", () => {
  const seen: Array<[number, number, boolean]> = [];
  heroGeometry({
    width: 1440,
    viewportHeight: 800,
    navHeight: 72,
    copyPad: PAD,
    measureCopy: (left, width, stacked) => {
      seen.push([left, width, stacked]);
      return COPY_HEIGHT;
    },
  });
  expect(seen).toHaveLength(1);
  expect(seen[0][0]).toBe(130);
  expect(seen[0][2]).toBe(false);
});
