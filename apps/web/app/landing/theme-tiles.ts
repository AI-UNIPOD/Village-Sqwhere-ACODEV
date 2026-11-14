// The tiles of the theme switch (theme-toggle.tsx): the plan and the drawing, with no page access
// so they can be tested.
//
// The page is cut into square tiles with one tile centred on the origin. Tile (i, j) is on ring
// m = |i| + |j|, so the rings are diamonds. Ring m starts to flip when the wave reaches it, and each
// tile then flips on its own short clock, hinged on the edge nearest the origin. The new page shows
// inside a diamond that stays one ring behind the last finished tile, so the diamond's edge always
// lies in flat, finished tiles and never crosses a folding one. The canvas draws only what is
// outside the diamond.

/** A curve from time (0 to 1) to progress. */
export type Ease = (x: number) => number;

export type Point = { x: number; y: number };

/** The fill colours: the new page's background, and four mixes of it with the text colour. */
export type TileColours = { plain: string; shades: [string, string, string, string] };

/** The part of a canvas 2D context the drawing uses. */
export type TileContext = Pick<
  CanvasRenderingContext2D,
  | "clearRect"
  | "save"
  | "restore"
  | "beginPath"
  | "rect"
  | "moveTo"
  | "lineTo"
  | "closePath"
  | "fill"
> & { fillStyle: string | CanvasGradient | CanvasPattern; clip: (fillRule: "evenodd") => void };

/** How much of the text colour is mixed into the background, by how far a flap is still open. */
export const SHADE_PERCENT = [0, 3, 6, 9, 12] as const;
/** One tile's flip, as a share of the whole run: short, so only a few rings fold at once. */
export const FLIP_SHARE = 0.14;
/** Share of the strong easing in the wave; the rest is a steady pace. */
export const WAVE_STRONG = 0.3;
// how much a flap narrows toward its free edge when it has only just lifted
const TAPER = 0.5;
// px each tile is drawn larger than its cell, so neighbours never show a gap
const OVERLAP = 0.5;
// px the canvas keeps inside the diamond's edge, so the two meet without a seam
const SEAM = 2.1;

const strongFallback: Ease = (x) => 1 - (1 - x) ** 4;
const outFallback: Ease = (x) => 1 - (1 - x) * (1 - x);

export type TilePlanInput = {
  width: number;
  height: number;
  /** The centre of the wave, in px from the top left of the screen. */
  origin: Point;
  /** The width of one tile in px. */
  pitch: number;
  /** The whole run in ms. */
  duration: number;
  /** The easing of the wave's strong part (`--ease-strong`); a built-in curve when missing. */
  strong?: Ease | null;
  /** The easing of one tile's flip (`--ease-out`); a built-in curve when missing. */
  flipEase?: Ease | null;
};

/** What one frame holds: polygons to fill, by shade level (0 is the plain background). */
export type TileFrame = {
  levels: [number[], number[], number[], number[], number[]];
  count: number;
  /** The half diagonal, in px, of the diamond where the canvas keeps out, or 0. */
  inner: number;
};

export type TilePlan = {
  /** The half diagonal of the diamond at its end, in px: the animated value runs from 0 to this. */
  reach: number;
  /** The CSS `linear()` easing that sends the diamond's progress, 0 to 1, along the wave. */
  easing: string;
  /** When the wave reaches ring m, in ms (index m). */
  ringStart: number[];
  /** The half diagonal of the revealed diamond at time t ms, in px. */
  diamond: (t: number) => number;
  /** The polygons for progress `progress` (0 to 1, eased) at time `t` ms. Reused by the next call. */
  collect: (progress: number, t: number) => TileFrame;
  /** Draws `collect` on a canvas that spans the screen; returns the number of tiles drawn. */
  draw: (ctx: TileContext, progress: number, t: number, colours: TileColours) => number;
};

export function createTilePlan(input: TilePlanInput): TilePlan {
  const { width: W, height: H, origin: o, pitch: P, duration } = input;
  const strong = input.strong ?? strongFallback;
  const flipEase = input.flipEase ?? outFallback;

  const reachM = Math.max(o.x, W - o.x) + Math.max(o.y, H - o.y); // the farthest corner, along the grid
  const lastRing = Math.ceil(reachM / P) + 1; // the last ring that has a tile on screen
  const rings = lastRing + 2;
  const flip = Math.round(duration * FLIP_SHARE);
  const waveTime = duration - flip;
  // the strong easing alone sends the wave across most of the screen in the first part of the run, so
  // every tile would flip at once and no front could be seen; a steady pace is mixed in
  const wave: Ease = (x) => WAVE_STRONG * strong(x) + (1 - WAVE_STRONG) * x;
  // rings reached after tau ms of wave
  const front = (tau: number) => (tau <= 0 ? 0 : rings * wave(Math.min(1, tau / waveTime)));

  const ringStart: number[] = [];
  for (let m = 0; m <= lastRing; m++) {
    const want = m / rings;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (wave(mid) < want) lo = mid;
      else hi = mid;
    }
    ringStart.push(hi * waveTime);
  }

  const reach = (rings - 1) * P;
  const diamond = (t: number) => Math.max(0, front(t - flip) - 1) * P;
  // the animation's own easing: progress = diamond(t) / reach, so the CSS clip and the canvas agree
  const stops: string[] = [];
  for (let t = 0; t < duration; t += 4) {
    stops.push(`${(diamond(t) / reach).toFixed(5)} ${((t / duration) * 100).toFixed(3)}%`);
  }
  stops.push("1 100%");
  const easing = `linear(${stops.join(", ")})`;

  const frame: TileFrame = { levels: [[], [], [], [], []], count: 0, inner: 0 };
  const iLo = Math.ceil((-P - o.x) / P);
  const iHi = Math.floor((W + P - o.x) / P);
  const jLo = Math.ceil((-P - o.y) / P);
  const jHi = Math.floor((H + P - o.y) / P);

  // every polygon is stored clockwise: with the nonzero fill rule, overlapping polygons of opposite
  // winding would cancel and leave a hole where the old theme shows through
  function quad(level: number, a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) {
    if ((c - a) * (f - b) - (d - b) * (e - a) >= 0) frame.levels[level].push(a, b, c, d, e, f, g, h);
    else frame.levels[level].push(g, h, e, f, c, d, a, b);
  }
  function box(level: number, x0: number, y0: number, x1: number, y1: number) {
    quad(level, x0, y0, x1, y0, x1, y1, x0, y1);
  }

  // one tile at open fraction pe (0 to 1): a card hinged on its edge nearest the origin, growing outward
  function tile(i: number, j: number, pe: number) {
    if (j < jLo || j > jHi) return 0;
    const h = P / 2;
    const cx = o.x + i * P;
    const cy = o.y + j * P;
    if (pe >= 1) {
      box(0, cx - h - OVERLAP, cy - h - OVERLAP, cx + h + OVERLAP, cy + h + OVERLAP);
      return 1;
    }
    const level = Math.min(4, Math.ceil((1 - pe) * 4));
    const w = pe * P;
    if (i === 0 && j === 0) {
      // the tile on the origin has no near edge: it opens from its centre
      box(level, cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2);
      box(0, cx - w / 4, cy - w / 4, cx + w / 4, cy + w / 4);
      return 2;
    }
    // The flap seen in perspective: full height on the hinge, narrowing toward its free edge while it
    // is still open (a card swinging up from the page), so neighbours read as blocks.
    const taper = TAPER * (1 - pe);
    const half = w / 2;
    const span = (u: number) => h * (1 - taper * (u / (w || 1))) + OVERLAP * (1 - u / (w || 1));
    if (Math.abs(i) >= Math.abs(j)) {
      // hinged on a vertical edge, opening left or right
      const dx = i < 0 ? -1 : 1;
      const xh = cx - dx * h;
      const s0 = span(0);
      const s1 = span(half);
      const s2 = span(w);
      quad(0, xh - dx * 0.75, cy - s0, xh + dx * half, cy - s1, xh + dx * half, cy + s1, xh - dx * 0.75, cy + s0);
      quad(level, xh + dx * half, cy - s1, xh + dx * w, cy - s2, xh + dx * w, cy + s2, xh + dx * half, cy + s1);
    } else {
      // hinged on a horizontal edge, opening up or down
      const dy = j < 0 ? -1 : 1;
      const yh = cy - dy * h;
      const s0 = span(0);
      const s1 = span(half);
      const s2 = span(w);
      quad(0, cx - s0, yh - dy * 0.75, cx - s1, yh + dy * half, cx + s1, yh + dy * half, cx + s0, yh - dy * 0.75);
      quad(level, cx - s1, yh + dy * half, cx - s2, yh + dy * w, cx + s2, yh + dy * w, cx + s1, yh + dy * half);
    }
    return 2;
  }

  function collect(progress: number, t: number): TileFrame {
    const s = progress * reach;
    let n = 0;
    for (const level of frame.levels) level.length = 0;
    // rings inside the diamond are covered by the real page: start at its edge
    for (let m = Math.max(0, Math.floor(s / P)); m <= lastRing; m++) {
      const p = (t - ringStart[m]) / flip;
      if (p <= 0) break; // the wave has not reached this ring, nor the later ones
      const pe = p >= 1 ? 1 : flipEase(p);
      const a = Math.max(-m, iLo);
      const b = Math.min(m, iHi);
      for (let i = a; i <= b; i++) {
        const r = m - Math.abs(i);
        n += tile(i, r, pe);
        if (r > 0) n += tile(i, -r, pe);
      }
    }
    frame.count = n;
    frame.inner = s - SEAM;
    return frame;
  }

  function draw(ctx: TileContext, progress: number, t: number, colours: TileColours) {
    ctx.clearRect(0, 0, W, H);
    const { levels, count, inner } = collect(progress, t);
    if (!count) return 0;
    ctx.save();
    // keep out of the diamond (the real page shows there), overlapping its edge by a hair
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    if (inner > 2) {
      ctx.moveTo(o.x, o.y - inner);
      ctx.lineTo(o.x + inner, o.y);
      ctx.lineTo(o.x, o.y + inner);
      ctx.lineTo(o.x - inner, o.y);
      ctx.closePath();
    }
    ctx.clip("evenodd");
    // shaded halves first; the plain halves then go on top where they overlap
    for (let level = 4; level >= 0; level--) {
      const points = levels[level];
      if (!points.length) continue;
      ctx.fillStyle = level ? colours.shades[level - 1] : colours.plain;
      ctx.beginPath();
      for (let q = 0; q < points.length; q += 8) {
        ctx.moveTo(points[q], points[q + 1]);
        ctx.lineTo(points[q + 2], points[q + 3]);
        ctx.lineTo(points[q + 4], points[q + 5]);
        ctx.lineTo(points[q + 6], points[q + 7]);
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore();
    return count;
  }

  return { reach, easing, ringStart, diamond, collect, draw };
}

/** The fill colours for a theme: its background and four mixes of it with the text colour. */
export function tileColours(background: string, text: string, mixes: boolean): TileColours {
  const mix = (percent: number) => (mixes ? `color-mix(in srgb, ${background}, ${text} ${percent}%)` : background);
  return {
    plain: background,
    shades: [mix(SHADE_PERCENT[1]), mix(SHADE_PERCENT[2]), mix(SHADE_PERCENT[3]), mix(SHADE_PERCENT[4])],
  };
}
