import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  cubicBezier,
  layoutCrowd,
  pack,
  parseCubicBezier,
  parseEasing,
  parseSeconds,
  planCycle,
  pointerOnWord,
  runsFromAlpha,
  scrollOffset,
  zoneFade,
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

// the matcher has no score today, so the hero must not float the word
test("the crowd has no word for a feature the product does not have", () => {
  expect(CROWD).not.toContain("score");
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

const g = heroGeometry({ width: 1440, viewportHeight: 800, navHeight: 72, copyPad: 32, measureCopy: () => 240 });
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

test("no name walks across the text block or the motion button on its way in or out", () => {
  const [copy, , button] = avoid;
  for (const cycle of [0, 1, 2, 3, 4, 5]) {
    for (const p of planCycle({ ...field, cycle }).pieces) {
      for (let k = 0; k <= p.steps; k++) {
        const [cx, cy] = at(p, k);
        const x0 = g.x + cx * g.cell;
        const y0 = g.y + cy * g.cell;
        for (const [ax0, ay0, ax1, ay1] of [copy, button]) {
          const clear = x0 + p.len * g.cell <= ax0 || x0 >= ax1 || y0 + g.cell <= ay0 || y0 >= ay1;
          expect(clear).toBe(true);
        }
      }
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
  // the crowd spans the whole width, edge to edge, not only the content column
  expect(Math.min(...words.map((w) => w.x))).toBeLessThanOrEqual(6 + 6);
  expect(Math.max(...words.map((w) => w.x + w.w))).toBeGreaterThanOrEqual(1440 - 6 - 6);
});

// ---------- the scroll ----------

// the real token values, read from the design system's tokens.css
const LINEAR = parseEasing("linear")!;
// --dur-drift, read from the design system itself: the crowd moves --space-8 every cycle
const TOKENS_CSS = readFileSync(join(__dirname, "../../../../docs/design-system/tokens.css"), "utf8");
const CYCLE = parseSeconds(/--dur-drift:\s*([^;]+);/.exec(TOKENS_CSS)![1])!;
const DISTANCE = 32; // --space-8
const SPEED = DISTANCE / CYCLE; // 16px a second
const WIDTH = 360; // the crowd repeats every hero width

test("reads the scroll tokens: the linear easing and the 2 second step", () => {
  expect(LINEAR(0.25)).toBe(0.25);
  expect(CYCLE).toBe(2);
  expect(parseSeconds("400ms")).toBe(0.4);
  expect(parseEasing("cubic-bezier(0.32, 0.72, 0, 1)")!(1)).toBe(1);
  expect(parseEasing("")).toBeNull();
  expect(parseCubicBezier("")).toBeNull();
  expect(parseSeconds("")).toBeNull();
});

test("a cubic-bezier easing starts at 0, ends at 1 and never goes back", () => {
  const ease = cubicBezier(parseCubicBezier("cubic-bezier(0.32, 0.72, 0, 1)")!);
  expect(ease(0)).toBe(0);
  expect(ease(1)).toBe(1);
  let last = 0;
  for (let i = 1; i <= 20; i++) {
    const v = ease(i / 20);
    expect(v).toBeGreaterThanOrEqual(last);
    last = v;
  }
});

const scroll = (t: number) => scrollOffset(t, CYCLE, DISTANCE, LINEAR, WIDTH);

test("the crowd moves right to left at a steady 16px a second and never comes back", () => {
  expect(SPEED).toBe(16);
  expect(scroll(0)).toBeCloseTo(0);
  expect(scroll(1)).toBeCloseTo(-16);
  expect(scroll(2)).toBeCloseTo(-32);
  expect(scroll(10)).toBeCloseTo(-160);
  // until it wraps, every moment is further left than the one before
  for (let t = 0.1; t < WIDTH / SPEED - 0.1; t += 0.1) expect(scroll(t)).toBeLessThan(scroll(t - 0.1));
});

test("the loop has no seam: after one hero width the crowd is back where it started", () => {
  const loop = WIDTH / SPEED; // 22.5 seconds at 360px
  for (let t = 0; t < 2 * loop; t += 0.7) {
    expect(scroll(t)).toBeLessThanOrEqual(0);
    expect(scroll(t)).toBeGreaterThan(-WIDTH);
    // the same picture one full width later: the crowd repeats every width
    expect(scroll(t + loop)).toBeCloseTo(scroll(t));
  }
  // and across the wrap the picture keeps moving left by the same small step, not jumping
  const before = scroll(loop - 0.1);
  const after = scroll(loop + 0.1);
  expect(((after - before + WIDTH) % WIDTH) - WIDTH).toBeCloseTo(-0.2 * SPEED);
});

test("a word fades out as it reaches the text, the square or the button", () => {
  const zone = [[100, 100, 200, 200]] as const;
  expect(zoneFade([0, 0, 40, 10], zone, 12)).toBe(1); // far away
  expect(zoneFade([60, 150, 94, 160], zone, 12)).toBeCloseTo(0.5); // 6px from the zone
  expect(zoneFade([90, 150, 110, 160], zone, 12)).toBe(0); // touching it
});

test("knows when the pointer rests directly on a word, wherever the scroll has moved it", () => {
  const words = [{ x: 100, y: 50, w: 40, t: "team" }];
  expect(pointerOnWord(words, 110, 55, 0, 10)).toBe(true);
  expect(pointerOnWord(words, 110, 55, -32, 10)).toBe(false); // the word has moved left
  expect(pointerOnWord(words, 80, 55, -32, 10)).toBe(true);
  expect(pointerOnWord(words, 110, 70, 0, 10)).toBe(false); // below the word
});

test("a word that has scrolled off the left edge is found again coming in from the right", () => {
  const words = [{ x: 10, y: 50, w: 40, t: "team" }];
  // shifted 30px left, it shows at -20..20, and one hero width (360px) further right
  expect(pointerOnWord(words, 15, 55, -30, 10, [], 360)).toBe(true);
  expect(pointerOnWord(words, 350, 55, -30, 10, [], 360)).toBe(true);
  expect(pointerOnWord(words, 350, 55, -30, 10)).toBe(false); // without the repeat
});

test("a word that has drifted behind the text is hidden, so resting on it does not hold the drift", () => {
  const words = [{ x: 100, y: 50, w: 40, t: "team" }];
  const headline = [[60, 40, 120, 70]] as const; // the word now overlaps the text area
  expect(pointerOnWord(words, 80, 55, -32, 10, headline)).toBe(false);
  expect(pointerOnWord(words, 80, 55, -32, 10, [])).toBe(true);
});
