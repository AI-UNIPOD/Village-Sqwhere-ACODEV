// Where the hero puts its text and its 32 by 32 square. A direct port of the layout step of
// the approved B3v landing page, so the page matches it exactly. The numbers are layout
// arithmetic (breakpoints and margins), not styling: styling lives in the CSS tokens.

const CONTENT_MAX = 1180; // the design system's --content-max
const WIDE = 1200; // from here the text sits left and the square right
const PHONE = 600; // below this the text is centred above the square
const FLOAT_CLEAR = 60; // room kept at the right edge for the floating buttons
const SIDE = 32; // the content's side padding from 768px

export type HeroGeometry = {
  /** One cell of the square, in px. The square is 32 cells wide. */
  cell: number;
  square: number;
  x: number;
  y: number;
  height: number;
  copyLeft: number;
  copyTop: number;
  copyWidth: number;
  copyHeight: number;
  centered: boolean;
  /** Top left of the pause button, under the square (centred on phones). */
  playX: number;
  playY: number;
};

const PLAY_SIZE = 36; // the design system's --float-size

// the pause button sits 12px under the square: at its left edge, or centred when the text is
function withPlay(g: Omit<HeroGeometry, "playX" | "playY">): HeroGeometry {
  const playX = g.centered ? Math.round(g.x + g.square / 2 - PLAY_SIZE / 2) : g.x;
  return { ...g, playX, playY: g.y + g.square + 12 };
}

/** The areas the crowd and the walking names keep clear of: the text, the square, the button. */
export function heroAvoid(g: HeroGeometry) {
  return [
    [g.copyLeft - 14, g.copyTop - 14, g.copyLeft + g.copyWidth + 14, g.copyTop + g.copyHeight + 14],
    [g.x - g.cell, g.y - g.cell, g.x + g.square + g.cell, g.y + g.square + g.cell],
    [g.playX - 8, g.y + g.square + 4, g.playX + 44, g.y + g.square + 56],
  ] as const;
}

type HeroInput = {
  width: number;
  viewportHeight: number;
  navHeight: number;
  /** Height the text block takes when placed at this left edge and width. */
  measureCopy: (left: number, width: number) => number;
};

export function isPhoneWidth(width: number) {
  return width < PHONE;
}

export function heroGeometry({
  width: W,
  viewportHeight,
  navHeight,
  measureCopy,
}: HeroInput): HeroGeometry {
  const wide = W >= WIDE;
  const phone = isPhoneWidth(W);
  const margin = Math.max(0, Math.round((W - CONTENT_MAX) / 2));
  const contentRight = W - margin;
  // the square's cell is about 1.1% of the width (14px at 1280); on phones it is the largest
  // that fits the column between the 60px margins
  const cell = phone
    ? Math.max(7, Math.min(9, Math.floor((W - 2 * FLOAT_CLEAR) / 32)))
    : Math.max(8, Math.min(16, Math.round(W * 0.011)));
  const square = 32 * cell;

  if (wide) {
    // the text starts where the section text starts; the square ends where it ends
    const copyLeft = margin + SIDE;
    const x = contentRight - (W < 1240 ? FLOAT_CLEAR : SIDE) - square;
    const copyWidth = Math.min(640, x - 6 * cell - copyLeft);
    const copyHeight = measureCopy(copyLeft, copyWidth);
    const height = Math.max(square + 14 * cell, viewportHeight - navHeight, copyHeight + 96);
    const y = Math.round((height - square) / 2) - 18;
    const copyTop = Math.round(y + (square - copyHeight) / 2);
    return withPlay({ cell, square, x, y, height, copyLeft, copyTop, copyWidth, copyHeight, centered: false });
  }

  if (phone) {
    // centred, with equal 60px margins so the floating buttons never sit on the hero
    const copyLeft = FLOAT_CLEAR;
    const copyWidth = W - 2 * FLOAT_CLEAR;
    const copyTop = 40;
    const copyHeight = measureCopy(copyLeft, copyWidth);
    const x = Math.round((W - square) / 2);
    const y = copyTop + copyHeight + 8 * cell + 32;
    const height = y + square + 9 * cell + 48;
    return withPlay({ cell, square, x, y, height, copyLeft, copyTop, copyWidth, copyHeight, centered: true });
  }

  const copyLeft = SIDE;
  const copyWidth = Math.min(560, W - copyLeft - FLOAT_CLEAR);
  const copyTop = 40;
  const copyHeight = measureCopy(copyLeft, copyWidth);
  const x = Math.min(Math.round((W - square) / 2), W - FLOAT_CLEAR - square);
  const y = copyTop + copyHeight + 7 * cell + 32;
  const height = y + square + 8 * cell + 40;
  return withPlay({ cell, square, x, y, height, copyLeft, copyTop, copyWidth, copyHeight, centered: false });
}
