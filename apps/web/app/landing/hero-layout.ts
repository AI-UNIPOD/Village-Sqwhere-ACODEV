// Where the hero puts its text and its 32 by 32 square. A direct port of the layout step of
// the approved B3v landing page, so the page matches it exactly. The numbers are layout
// arithmetic (breakpoints and margins), not styling: styling lives in the CSS tokens.

// The frame the hero's text and square sit in. It is the design system's --content-max up to
// ~1640px wide, then FRAME_SHARE of the width, up to FRAME_MAX: the hero breaks out wider than
// the other sections on big screens. These mirror --content-max, --hero-frame-share and
// --hero-frame-max in tokens.css, which the landing header uses to line up with it.
const FRAME_MIN = 1180; // --content-max
const FRAME_SHARE = 0.72; // --hero-frame-share
const FRAME_MAX = 1760; // --hero-frame-max
const PHONE = 600; // below this the square is a little smaller and the headline may take 3 lines
const FLOAT_CLEAR = 60; // room kept clear at the sides of the hero (the floating buttons sat there)
const SIDE = 32; // the content's side padding from 768px

// Space between the text box's outer edge (its padding is the clearing in the crowd) and the
// square: to its left side by side, from its bottom edge when stacked.
export const GAP = 64; // --space-16
export const WIDE_GAP = 80; // --space-20: with the larger squares, from 20px cells
const gapFor = (cell: number) => (cell >= 20 ? WIDE_GAP : GAP);
export const PLAY_GAP = 12; // --space-3: the motion button sits this far under the square
const PLAY_MARGIN = 8; // --space-2: the crowd keeps this clear of the motion button
const PLAY_HEIGHT = 36; // --float-size
const PLAY_WIDTH = 36; // the button before it is measured (--float-size)

// The headline's longest line, in ems of its font size, once it is split over two lines
// ("Africa, one square." is 11.63em, the French line is shorter). It is read from the
// `--hero-measure` token in tokens.css, which divides the box width by the same number, so the
// headline takes two lines at 600px and wider.
export const DEFAULT_MEASURE = 12.1;
// Side by side, the square is sized to the text and not the other way round: the biggest cell
// that still leaves the headline its target: 48px, or 85% of its fluid size when that is more
// (so on big screens the headline stays in proportion to the square). If even the smallest cell
// leaves less than MIN_HEADLINE_PX, the two stack.
const TARGET_HEADLINE_PX = 48;
const TARGET_SHARE = 0.85;
const TARGET_SLACK = 0.1; // px: a headline this close to its target is on it (rounding of the frame)
const MIN_HEADLINE_PX = 42;
const MIN_SIDE_CELL = 11;
const MAX_HEADLINE_PX = 80; // --type-hero's largest size
const MAX_WIDE_CELL = 20; // the largest cell on a big screen
const WIDE_CELL_SHARE = 0.0115; // of the frame's width
const WIDE_CELL_HEIGHT = 0.62; // of the room under the header: the square never takes more
const MAX_STACK_TEXT = 680; // widest text column above the square

// the headline's fluid size from --type-hero: clamp(2.25rem, 1.2rem + 2.6vw, 5rem)
const fluidHeadline = (width: number) =>
  Math.min(MAX_HEADLINE_PX, Math.max(36, 19.2 + 0.026 * width));

export type HeroGeometry = {
  /** One cell of the square, in px. The square is 32 cells wide. */
  cell: number;
  square: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The text box, padding included. */
  copyLeft: number;
  copyTop: number;
  copyWidth: number;
  copyHeight: number;
  /** True when the text box sits above the square and both are centred (not side by side). */
  stacked: boolean;
  /** Same as `stacked`: the motion button is centred when the text is. */
  centered: boolean;
  /** The frame the text and the square sit in: the hero's column, or the whole width when narrower. */
  frameLeft: number;
  frameRight: number;
  /** Top left of the motion button, under the square (centred when stacked), and its width. */
  playX: number;
  playY: number;
  playWidth: number;
};

// the motion button sits 12px under the square: at its left edge, or centred when the text is
function withPlay(
  g: Omit<HeroGeometry, "playX" | "playY" | "playWidth" | "centered">,
  playWidth: number,
): HeroGeometry {
  const playX = g.stacked ? Math.round(g.x + g.square / 2 - playWidth / 2) : g.x;
  return { ...g, centered: g.stacked, playX, playY: g.y + g.square + PLAY_GAP, playWidth };
}

/** The areas the crowd and the walking names keep clear of: the text box, the square, the button. */
export function heroAvoid(g: HeroGeometry): Array<readonly [number, number, number, number]> {
  const areas: Array<readonly [number, number, number, number]> = [
    [g.copyLeft - 14, g.copyTop - 14, g.copyLeft + g.copyWidth + 14, g.copyTop + g.copyHeight + 14],
    [g.x - g.cell, g.y - g.cell, g.x + g.square + g.cell, g.y + g.square + g.cell],
    [
      g.playX - PLAY_MARGIN,
      g.playY - PLAY_MARGIN,
      g.playX + g.playWidth + PLAY_MARGIN,
      g.playY + PLAY_HEIGHT + PLAY_MARGIN,
    ],
  ];
  // Side by side, the gap between the box and the square stays clear too: only short words fit
  // that strip, so the crowd would read as a ragged one-word column (or words cut by the mask)
  // instead of a gap.
  if (!g.stacked) {
    areas.push([g.copyLeft + g.copyWidth, g.y - g.cell, g.x, g.y + g.square + g.cell]);
  }
  return areas;
}

type HeroInput = {
  width: number;
  viewportHeight: number;
  navHeight: number;
  /** The text box's padding in px (the same on all four sides). */
  copyPad: number;
  /** The headline's measure in ems (`--hero-measure`). */
  measure?: number;
  /** The motion button's measured width in px: it differs between languages. */
  playWidth?: number;
  /** Height the text box takes, padding included, when placed at this left edge and outer width. */
  measureCopy: (left: number, width: number, stacked: boolean) => number;
};

/** The width of the frame the hero's text and square sit in, for a hero this wide. */
export const heroFrameWidth = (W: number) =>
  Math.round(Math.min(FRAME_MAX, Math.max(FRAME_MIN, FRAME_SHARE * W)));

export function heroGeometry({
  width: W,
  viewportHeight,
  navHeight,
  copyPad: pad,
  measure = DEFAULT_MEASURE,
  playWidth = PLAY_WIDTH,
  measureCopy,
}: HeroInput): HeroGeometry {
  const phone = W < PHONE;
  const frame = heroFrameWidth(W);
  const margin = Math.max(0, Math.round((W - frame) / 2));
  const contentRight = W - margin;
  const frameLeft = margin;
  const frameRight = contentRight;
  // the largest cell: about 1.1% of the width (14px at 1280); on phones it is the largest that
  // fits the column between the 60px margins
  const baseCap = phone
    ? Math.max(7, Math.min(9, Math.floor((W - 2 * FLOAT_CLEAR) / 32)))
    : Math.max(8, Math.min(16, Math.round(W * 0.011)));
  // Side by side on a big screen the square may grow past that, up to 20px cells, with the
  // frame; the height only limits that growth, never the cap above.
  const wideCap =
    frame > FRAME_MIN
      ? Math.min(
          MAX_WIDE_CELL,
          Math.round(frame * WIDE_CELL_SHARE),
          Math.floor((WIDE_CELL_HEIGHT * (viewportHeight - navHeight)) / 32),
        )
      : 0;
  const capCell = Math.max(baseCap, wideCap);

  // Side by side: the text itself starts where the section text starts (the box reaches out by
  // its padding) and the square ends where the section text ends, GAP clear of the box.
  const boxLeft = margin + SIDE - pad;
  const maxBox = measure * MAX_HEADLINE_PX + 2 * pad; // no wider than the largest headline needs
  const sideAt = (cell: number) => {
    const square = 32 * cell;
    const x = contentRight - (W < 1240 ? FLOAT_CLEAR : SIDE) - square;
    const box = Math.min(maxBox, x - gapFor(cell) - boxLeft);
    return { cell, square, x, box, headline: (box - 2 * pad) / measure };
  };
  if (!phone) {
    const fluid = fluidHeadline(W);
    const target = Math.min(fluid, Math.max(TARGET_HEADLINE_PX, TARGET_SHARE * fluid));
    const smallest = Math.min(MIN_SIDE_CELL, capCell);
    let side = sideAt(smallest);
    for (let c = capCell; c > smallest; c--) {
      const candidate = sideAt(c);
      if (candidate.headline >= target - TARGET_SLACK) {
        side = candidate;
        break;
      }
    }
    if (side.headline >= MIN_HEADLINE_PX) {
      const { cell, square, x, box } = side;
      const copyHeight = measureCopy(boxLeft, box, false);
      const height = Math.max(square + 14 * cell, viewportHeight - navHeight, copyHeight + 96);
      const y = Math.round((height - square) / 2) - 18;
      const copyTop = Math.round(y + (square - copyHeight) / 2);
      return withPlay(
        {
          cell, square, x, y, width: W, height, copyLeft: boxLeft, copyTop, copyWidth: box,
          copyHeight, stacked: false, frameLeft, frameRight,
        },
        playWidth,
      );
    }
  }

  // Stacked: the text box over the square, both centred on the page, with equal space left and
  // right. The text keeps 60px clear at both sides (the floating buttons sit at the right), so
  // the box, which reaches out by its padding, keeps 60px minus the padding.
  const cell = baseCap;
  const square = 32 * cell;
  let copyWidth = Math.min(MAX_STACK_TEXT + 2 * pad, W - 2 * (FLOAT_CLEAR - pad));
  if ((W - copyWidth) % 2) copyWidth -= 1; // an even space left and right
  const copyLeft = (W - copyWidth) / 2;
  const copyTop = Math.max(8, 40 - pad); // the text itself starts 40px down
  const copyHeight = measureCopy(copyLeft, copyWidth, true);
  const x = Math.round((W - square) / 2);
  const y = copyTop + copyHeight + gapFor(cell);
  const height = phone ? y + square + 9 * cell + 48 : y + square + 8 * cell + 40;
  return withPlay(
    {
      cell, square, x, y, width: W, height, copyLeft, copyTop, copyWidth, copyHeight,
      stacked: true, frameLeft, frameRight,
    },
    playWidth,
  );
}
