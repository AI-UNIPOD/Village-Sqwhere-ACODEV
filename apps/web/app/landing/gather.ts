// The gathering in the hero: African country names walk one cell at a time into the 32 by 32
// grid where the logo is drawn, the real logo fades in, and they walk back out. A port of the
// approved B3v landing page. Everything here is pure, so it is the same on every run and can
// be tested without a browser.

/** The 54 African countries: English, French, and the ISO 3166 code used where no name fits. */
export const COUNTRIES: ReadonlyArray<readonly [string, string, string]> = [
  ["Algeria", "Algérie", "DZA"], ["Angola", "Angola", "AGO"], ["Benin", "Bénin", "BEN"], ["Botswana", "Botswana", "BWA"],
  ["Burkina Faso", "Burkina Faso", "BFA"], ["Burundi", "Burundi", "BDI"], ["Cabo Verde", "Cap-Vert", "CPV"], ["Cameroon", "Cameroun", "CMR"],
  ["Central African Republic", "Centrafrique", "CAF"], ["Chad", "Tchad", "TCD"], ["Comoros", "Comores", "COM"], ["Congo", "Congo", "COG"],
  ["DR Congo", "RD Congo", "COD"], ["Djibouti", "Djibouti", "DJI"], ["Egypt", "Égypte", "EGY"], ["Equatorial Guinea", "Guinée équatoriale", "GNQ"],
  ["Eritrea", "Érythrée", "ERI"], ["Eswatini", "Eswatini", "SWZ"], ["Ethiopia", "Éthiopie", "ETH"], ["Gabon", "Gabon", "GAB"],
  ["Gambia", "Gambie", "GMB"], ["Ghana", "Ghana", "GHA"], ["Guinea", "Guinée", "GIN"], ["Guinea-Bissau", "Guinée-Bissau", "GNB"],
  ["Côte d'Ivoire", "Côte d'Ivoire", "CIV"], ["Kenya", "Kenya", "KEN"], ["Lesotho", "Lesotho", "LSO"], ["Liberia", "Liberia", "LBR"],
  ["Libya", "Libye", "LBY"], ["Madagascar", "Madagascar", "MDG"], ["Malawi", "Malawi", "MWI"], ["Mali", "Mali", "MLI"],
  ["Mauritania", "Mauritanie", "MRT"], ["Mauritius", "Maurice", "MUS"], ["Morocco", "Maroc", "MAR"], ["Mozambique", "Mozambique", "MOZ"],
  ["Namibia", "Namibie", "NAM"], ["Niger", "Niger", "NER"], ["Nigeria", "Nigeria", "NGA"], ["Rwanda", "Rwanda", "RWA"],
  ["São Tomé and Príncipe", "Sao Tomé-et-Principe", "STP"], ["Senegal", "Sénégal", "SEN"], ["Seychelles", "Seychelles", "SYC"], ["Sierra Leone", "Sierra Leone", "SLE"],
  ["Somalia", "Somalie", "SOM"], ["South Africa", "Afrique du Sud", "ZAF"], ["South Sudan", "Soudan du Sud", "SSD"], ["Sudan", "Soudan", "SDN"],
  ["Tanzania", "Tanzanie", "TZA"], ["Togo", "Togo", "TGO"], ["Tunisia", "Tunisie", "TUN"], ["Uganda", "Ouganda", "UGA"],
  ["Zambia", "Zambie", "ZMB"], ["Zimbabwe", "Zimbabwe", "ZWE"],
];

/** The background crowd: skills, English and French words, and a few made-up builders. */
export const CROWD = [
  "react", "postgres", "figma", "node", "flutter", "python", "ensemble", "idée", "équipe", "Aminata",
  "Wanjiru", "Kwabena", "Nour", "ideas", "team", "build", "plan", "api", "data", "design", "mobile",
  "review", "test", "Ọláolúwa", "Ɗanladi", "arbre", "together", "kotlin", "swift", "rust", "sql", "git",
  "docs", "ux", "merge", "pair", "ship", "sprint", "brainstorm", "hub", "matcher", "score",
];

/** Crowd words that show their other-language twin under the pointer. */
export const TWIN: Record<string, string> = {
  team: "équipe", ideas: "idées", build: "construire", together: "ensemble", "idée": "idea",
  "équipe": "team", ensemble: "together", data: "données", review: "revue", plan: "plan",
};

/** Seconds: one cell of walking, a fade, the pause before the logo, how long the logo stays. */
export const STEP = 0.045;
export const FADE = 0.3;
const HOLD = 0.4;
export const LOGO_HOLD = 2.2;

/** Fills the gaps in a row where no country name or code fits. */
const FILLER = String.fromCharCode(0xb7); // middle dot
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  "g",
);

export type Run = { x0: number; y: number; len: number };
export type Rect = readonly [number, number, number, number];
type Piece = {
  a: string[];
  len: number;
  /** Target cell in the logo grid. */
  tx: number;
  ty: number;
  /** Start cell in the crowd, set by planCycle. */
  sx: number;
  sy: number;
  steps: number;
  inStart: number;
  outStart: number;
};
export type Cycle = { pieces: Piece[]; logoAt: number; outAt: number; fadeAt: number; end: number };
export type CrowdWord = { x: number; y: number; w: number; t: string };

/** Seeded random numbers, so the page looks the same on every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** 0 before `start`, 1 after `start + duration`, a straight line between. */
export function seg(t: number, start: number, duration: number) {
  return clamp((t - start) / duration);
}

/** The letters of a name, one per grid cell, without combining accents. */
export function chars(s: string) {
  return Array.from(s.replace(COMBINING_MARKS, ""));
}

/** Reads a 32 by 32 alpha mask (as from getImageData) into the filled runs of each row. */
export function runsFromAlpha(alpha: ArrayLike<number>, size = 32): Run[] {
  const runs: Run[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (alpha[(y * size + x) * 4 + 3] <= 127) {
        x++;
        continue;
      }
      const x0 = x;
      while (x < size && alpha[(y * size + x) * 4 + 3] > 127) x++;
      runs.push({ x0, y, len: x - x0 });
    }
  }
  return runs;
}

type PackedPiece = Pick<Piece, "a" | "len" | "tx" | "ty">;

/**
 * Fills each run of the logo with whole country names, a middle dot between them. Where no
 * unused name fits, a three-letter code for a country not yet shown; then dots. Names switch
 * between English and French every cycle, and no country appears twice in one cycle.
 */
export function pack(runs: Run[], cycle: number): PackedPiece[] {
  const N = COUNTRIES.length;
  const used: Record<number, boolean> = {};
  const usedIso: Record<number, boolean> = {};
  let qi = (cycle * 19) % N;
  const out: PackedPiece[] = [];
  const nameOf = (i: number) => COUNTRIES[i][(i + cycle) % 2];
  for (const run of runs) {
    let i = 0;
    while (i < run.len) {
      const rem = run.len - i;
      let txt: string | null = null;
      for (let k = 0; k < N && txt == null; k++) {
        const idx = (qi + k) % N;
        if (!used[idx] && chars(nameOf(idx)).length <= rem) {
          txt = nameOf(idx);
          used[idx] = true;
          qi = (idx + 1) % N;
        }
      }
      if (txt == null && rem >= 3) {
        for (let k = 0; k < N && txt == null; k++) {
          const idx = (qi + k) % N;
          if (!used[idx] && !usedIso[idx]) {
            txt = COUNTRIES[idx][2];
            usedIso[idx] = true;
            used[idx] = true;
          }
        }
      }
      const a = txt == null ? new Array<string>(rem).fill(FILLER) : chars(txt);
      if (txt != null && i + a.length < run.len) a.push(FILLER);
      out.push({ a, len: a.length, tx: run.x0 + i, ty: run.y });
      i += a.length;
    }
  }
  return out;
}

/** Where a piece stands after k steps: one cell per step, along both axes at once. */
export function at(p: Piece, k: number): [number, number] {
  const dx = p.tx - p.sx;
  const dy = p.ty - p.sy;
  return [
    p.sx + Math.sign(dx) * Math.min(k, Math.abs(dx)),
    p.sy + Math.sign(dy) * Math.min(k, Math.abs(dy)),
  ];
}

function overlaps(rects: readonly Rect[], x0: number, y0: number, x1: number, y1: number) {
  return rects.some((q) => x1 > q[0] && x0 < q[2] && y1 > q[1] && y0 < q[3]);
}

type Field = {
  runs: Run[];
  cycle: number;
  cell: number;
  /** Top left of the square, in px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Areas the walking names must start clear of: the text, the square, the pause button. */
  avoid: readonly Rect[];
};

/**
 * One cycle: gives every piece a start cell in the crowd, on an even row, clear of the text,
 * the square, the pause button and the other pieces, about 7 to 19 cells from its target.
 * Then the timings: walk in, hold, logo, walk out.
 */
export function planCycle({ runs, cycle, cell: c, x: X, y: Y, width, height, avoid }: Field): Cycle {
  const rnd = rng(101 + cycle * 7);
  const gxMin = Math.ceil((4 - X) / c);
  const gxMax = Math.floor((width - 4 - X) / c) - 1;
  const gyMin = Math.ceil((6 - Y) / c);
  const gyMax = Math.floor((height - 6 - Y) / c) - 1;
  const occ = new Set<string>();
  const ok = (gx: number, gy: number, len: number) => {
    if (gx < gxMin || gx + len - 1 > gxMax || gy < gyMin || gy > gyMax) return false;
    for (let i = -1; i <= len; i++) if (occ.has(`${gx + i}|${gy}`)) return false;
    const x0 = X + gx * c;
    const y0 = Y + gy * c;
    return !overlaps(avoid, x0, y0, x0 + len * c, y0 + c);
  };

  const placed: Piece[] = [];
  let inEnd = 0;
  for (const packed of pack(runs, cycle)) {
    const want = 7 + rnd() * 12;
    let best: [number, number] | null = null;
    let bestScore = 1e9;
    for (let tries = 0; tries < 500; tries++) {
      const gy = gyMin + Math.floor(rnd() * (gyMax - gyMin + 1));
      const gx = gxMin + Math.floor(rnd() * (gxMax - gxMin - packed.len + 2));
      if (((gy % 2) + 2) % 2 || !ok(gx, gy, packed.len)) continue;
      const d = Math.max(
        Math.abs(gx + packed.len / 2 - (packed.tx + packed.len / 2)),
        Math.abs(gy - packed.ty),
      );
      const score = Math.abs(d - want);
      if (score < bestScore) {
        bestScore = score;
        best = [gx, gy];
        if (score < 1) break;
      }
    }
    if (!best) continue;
    for (let i = 0; i < packed.len; i++) occ.add(`${best[0] + i}|${best[1]}`);
    const steps = Math.max(Math.abs(packed.tx - best[0]), Math.abs(packed.ty - best[1]));
    const inStart = 0.6 + rnd() * 0.6;
    inEnd = Math.max(inEnd, inStart + steps * STEP);
    placed.push({ ...packed, sx: best[0], sy: best[1], steps, inStart, outStart: 0 });
  }

  const logoAt = inEnd + HOLD;
  const outAt = logoAt + FADE + LOGO_HOLD;
  let outEnd = 0;
  for (const p of placed) {
    p.outStart = outAt + FADE + 0.2 + rnd() * 0.5;
    outEnd = Math.max(outEnd, p.outStart + p.steps * STEP);
  }
  return { pieces: placed, logoAt, outAt, fadeAt: outEnd + 0.3, end: outEnd + 0.8 };
}

/** Size of the crowd's letters for a square cell: 7 to 10px. */
export function crowdFontSize(cell: number) {
  return Math.max(7, Math.min(10, Math.round(cell * 1.3) / 2));
}

/** Size of the walking names' letters for a square cell. */
export function nameFontSize(cell: number) {
  return Math.round(cell * 1.72) / 2;
}

type CrowdField = {
  width: number;
  height: number;
  /** Centre of the square, in px, and its size: the crowd is a little denser near it. */
  centerX: number;
  centerY: number;
  square: number;
  fontSize: number;
  avoid: readonly Rect[];
};

/** The background crowd: small words packed densely edge to edge, clear of the avoided areas. */
export function layoutCrowd({ width, height, centerX, centerY, square, fontSize, avoid }: CrowdField) {
  const rnd = rng(23);
  const rowHeight = fontSize + 3;
  const charWidth = fontSize * 0.6;
  const words: CrowdWord[] = [];
  for (let y = 6; y + rowHeight <= height - 4; y += rowHeight) {
    let x = 6;
    while (x < width - 6) {
      const t = CROWD[Math.floor(rnd() * CROWD.length)];
      const w = t.length * charWidth;
      const d = Math.hypot(x + w / 2 - centerX, y - centerY);
      const p = d < square * 0.8 ? 0.85 : Math.max(0.42, 0.85 - ((d - square * 0.8) / 500) * 0.43);
      if (
        x + w <= width - 6 &&
        rnd() < p &&
        !overlaps(avoid, x - 2, y - 1, x + w + 2, y + fontSize + 1)
      ) {
        words.push({ x, y, w, t });
        x += w + charWidth * (1 + Math.floor(rnd() * 2));
      } else {
        x += charWidth;
      }
    }
  }
  return words;
}

// ---------- the drift: the crowd glides toward the left and back, slowly, forever ----------

/** Reads a CSS `cubic-bezier(a, b, c, d)` token into its four numbers, or null. */
export function parseCubicBezier(value: string): [number, number, number, number] | null {
  const m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(
    value,
  );
  if (!m) return null;
  const n = [m[1], m[2], m[3], m[4]].map(Number);
  return n.some(Number.isNaN) ? null : [n[0], n[1], n[2], n[3]];
}

/** Reads a CSS time token ("12s" or "400ms") into seconds, or null. */
export function parseSeconds(value: string): number | null {
  const m = /^\s*([\d.]+)\s*(ms|s)\s*$/.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isNaN(n) ? null : m[2] === "ms" ? n / 1000 : n;
}

/** The easing curve a CSS `cubic-bezier` describes, as a function from time (0 to 1) to progress. */
export function cubicBezier([x1, y1, x2, y2]: [number, number, number, number]) {
  const bez = (t: number, a: number, b: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // find the curve parameter whose x is the given time, by halving: steady and exact enough
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (bez(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return bez((lo + hi) / 2, y1, y2);
  };
}

/**
 * How far the crowd is shifted at drift time t: toward the left by `distance` over the first
 * half of the cycle, then back, each half on the given easing. Always between -distance and 0.
 */
export function driftOffset(t: number, cycle: number, distance: number, ease: (x: number) => number) {
  const phase = (((t % cycle) + cycle) % cycle) / cycle;
  return phase < 0.5 ? -distance * ease(phase * 2) : -distance * (1 - ease((phase - 0.5) * 2));
}

/**
 * How visible a drifting word is near the areas the crowd keeps clear of: 0 when it touches
 * one, 1 once it is `feather` px away, a straight line between. So words fade at the edges
 * of the text, the square and the button instead of sliding under them.
 */
export function zoneFade(
  box: Rect,
  avoid: readonly Rect[],
  feather: number,
) {
  let fade = 1;
  for (const [ax0, ay0, ax1, ay1] of avoid) {
    const dx = Math.max(ax0 - box[2], box[0] - ax1, 0);
    const dy = Math.max(ay0 - box[3], box[1] - ay1, 0);
    const gap = Math.max(dx, dy);
    if (dx === 0 && dy === 0) return 0;
    fade = Math.min(fade, feather > 0 ? clamp(gap / feather) : 1);
  }
  return fade;
}

/**
 * Whether the pointer rests directly on one of the crowd's words, at the current shift. Words
 * that have drifted into the text, the square or the button are hidden, so they do not count.
 */
export function pointerOnWord(
  words: readonly CrowdWord[],
  x: number,
  y: number,
  shift: number,
  fontSize: number,
  avoid: readonly Rect[] = [],
) {
  return words.some((w) => {
    const x0 = w.x + shift;
    const box: Rect = [x0, w.y, x0 + w.w, w.y + fontSize];
    return x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && zoneFade(box, avoid, 0) > 0;
  });
}
