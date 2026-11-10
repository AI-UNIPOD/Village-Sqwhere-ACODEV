import { expect, test } from "vitest";

import {
  COUNTRIES,
  CROWD,
  FADE,
  LOGO_HOLD,
  STEP,
  TWIN,
  at,
  chars,
  layoutCrowd,
  pack,
  planCycle,
  runsFromAlpha,
  type Run,
} from "./gather";
import { heroAvoid, heroGeometry } from "./hero-layout";

// a small V on the 32 by 32 grid: a wide canopy row, two limbs and a foot
const RUNS: Run[] = [
  { x0: 2, y: 10, len: 28 },
  { x0: 3, y: 12, len: 26 },
  { x0: 7, y: 14, len: 5 },
  { x0: 20, y: 14, len: 5 },
  { x0: 10, y: 20, len: 4 },
  { x0: 18, y: 20, len: 4 },
  { x0: 14, y: 28, len: 4 },
];

const DOT = String.fromCharCode(0xb7);

// which country a piece names, by its name in either language or its code
function countryOf(text: string) {
  return COUNTRIES.findIndex(([en, fr, iso]) =>
    [en, fr, iso].some((name) => chars(name).join("") === text),
  );
}

test("lists the 54 African countries once each, in English and French, with their codes", () => {
  expect(COUNTRIES).toHaveLength(54);
  expect(new Set(COUNTRIES.map(([, , iso]) => iso)).size).toBe(54);
  for (const [en, fr, iso] of COUNTRIES) {
    expect(en.trim()).not.toBe("");
    expect(fr.trim()).not.toBe("");
    expect(iso).toMatch(/^[A-Z]{3}$/);
  }
});

test("every twin word is in the crowd, so the pointer can find it", () => {
  for (const word of Object.keys(TWIN)) expect(CROWD).toContain(word);
});

test("reads the filled cells of a mask into runs per row", () => {
  const size = 4;
  const alpha = new Array(size * size * 4).fill(0);
  for (const [x, y] of [[1, 0], [2, 0], [0, 2], [3, 2]]) alpha[(y * size + x) * 4 + 3] = 255;
  expect(runsFromAlpha(alpha, size)).toEqual([
    { x0: 1, y: 0, len: 2 },
    { x0: 0, y: 2, len: 1 },
    { x0: 3, y: 2, len: 1 },
  ]);
});

test("fills every run of the logo exactly, cell for cell", () => {
  const pieces = pack(RUNS, 0);
  for (const run of RUNS) {
    const row = pieces.filter((p) => p.ty === run.y && p.tx >= run.x0 && p.tx < run.x0 + run.len);
    expect(row.reduce((n, p) => n + p.len, 0)).toBe(run.len);
    let x = run.x0;
    for (const p of row) {
      expect(p.tx).toBe(x);
      expect(p.a).toHaveLength(p.len);
      x += p.len;
    }
  }
});

test("names no country twice in one cycle", () => {
  for (const cycle of [0, 1, 2, 7]) {
    const seen = pack(RUNS, cycle)
      .map((p) => p.a.filter((ch) => ch !== DOT).join(""))
      .filter((text) => text !== "")
      .map(countryOf);
    expect(seen).not.toContain(-1);
    expect(new Set(seen).size).toBe(seen.length);
  }
});

test("switches each country between English and French from one cycle to the next", () => {
  for (const cycle of [0, 1]) {
    for (const p of pack(RUNS, cycle)) {
      const text = p.a.filter((ch) => ch !== DOT).join("");
      const i = countryOf(text);
      if (i < 0 || text === COUNTRIES[i][2]) continue; // a code, not a name
      const expected = chars(COUNTRIES[i][(i + cycle) % 2]).join("");
      expect(text).toBe(expected);
    }
  }
});

const g = heroGeometry({ width: 1440, viewportHeight: 800, navHeight: 72, measureCopy: () => 240 });
const avoid = heroAvoid(g);
const field = { runs: RUNS, cell: g.cell, x: g.x, y: g.y, width: 1440, height: g.height, avoid };

test("starts every name in the crowd on an even row, clear of the text, square and button", () => {
  const { pieces } = planCycle({ ...field, cycle: 0 });
  expect(pieces.length).toBeGreaterThan(0);
  const taken = new Set<string>();
  for (const p of pieces) {
    expect(((p.sy % 2) + 2) % 2).toBe(0);
    const x0 = g.x + p.sx * g.cell;
    const y0 = g.y + p.sy * g.cell;
    expect(x0).toBeGreaterThanOrEqual(0);
    expect(x0 + p.len * g.cell).toBeLessThanOrEqual(1440);
    for (const [ax0, ay0, ax1, ay1] of avoid) {
      const clear = x0 + p.len * g.cell <= ax0 || x0 >= ax1 || y0 + g.cell <= ay0 || y0 >= ay1;
      expect(clear).toBe(true);
    }
    for (let i = 0; i < p.len; i++) {
      const key = `${p.sx + i}|${p.sy}`;
      expect(taken.has(key)).toBe(false);
      taken.add(key);
    }
  }
});

test("walks each name one cell per step until it stands on its target", () => {
  for (const p of planCycle({ ...field, cycle: 0 }).pieces) {
    expect(at(p, 0)).toEqual([p.sx, p.sy]);
    expect(at(p, p.steps)).toEqual([p.tx, p.ty]);
    expect(at(p, p.steps + 5)).toEqual([p.tx, p.ty]);
  }
});

test("times one cycle: walk in, hold, logo for 2.2 seconds, walk out", () => {
  const cycle = planCycle({ ...field, cycle: 0 });
  const arrivals = cycle.pieces.map((p) => p.inStart + p.steps * STEP);
  for (const p of cycle.pieces) {
    expect(p.inStart).toBeGreaterThanOrEqual(0.6);
    expect(p.inStart).toBeLessThanOrEqual(1.2);
    expect(p.outStart).toBeGreaterThan(cycle.outAt);
  }
  expect(cycle.logoAt).toBeGreaterThan(Math.max(...arrivals));
  expect(cycle.outAt).toBeCloseTo(cycle.logoAt + FADE + LOGO_HOLD);
  expect(cycle.end).toBeGreaterThan(cycle.fadeAt);
});

test("plans the same cycle every time, so the page looks the same on every visit", () => {
  expect(planCycle({ ...field, cycle: 3 })).toEqual(planCycle({ ...field, cycle: 3 }));
});

test("packs the crowd edge to edge without covering the text, the square or the button", () => {
  const words = layoutCrowd({
    width: 1440,
    height: g.height,
    centerX: g.x + g.square / 2,
    centerY: g.y + g.square / 2,
    square: g.square,
    fontSize: 10,
    avoid,
  });
  expect(words.length).toBeGreaterThan(200);
  for (const w of words) {
    expect(CROWD).toContain(w.t);
    expect(w.x).toBeGreaterThanOrEqual(6);
    expect(w.x + w.w).toBeLessThanOrEqual(1440 - 6);
    for (const [ax0, ay0, ax1, ay1] of avoid) {
      const clear = w.x + w.w + 2 <= ax0 || w.x - 2 >= ax1 || w.y + 11 <= ay0 || w.y - 1 >= ay1;
      expect(clear).toBe(true);
    }
  }
});
