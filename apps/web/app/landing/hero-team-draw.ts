// Drawing for the hero's pointer story (hero-team.ts): the chip, the ring, the names, their
// labels and the signatures. Canvas text is decorative: the layer is aria-hidden, and nothing
// here is needed to use the page. Colours come from the design system's tokens, read by the hero.

import { seg } from "./gather";
import type { HeroTeamCopy } from "./hero-team-copy";
import { captionAlpha, memberStory, ringAlpha, seatAngles, type Holder, type Team } from "./hero-team";

export type Pen = {
  g: CanvasRenderingContext2D;
  colors: { bg: string; text: string; muted: string; lineStrong: string; ai: string; success: string };
  mono: string;
  /** The hero's width: a label is kept inside it. */
  width: number;
  /** The crowd's letter size: a name drawn over its place covers one row of that height. */
  fontSize: number;
  copy: HeroTeamCopy;
  /** --ease-out, for the signatures. */
  easeOut: (x: number) => number;
};

const LABEL = 9.5;

const font = (pen: Pen, px: number, weight: number) => `${weight} ${px}px ${pen.mono}`;

export function measure(pen: Pen, text: string, px: number, weight: number) {
  pen.g.font = font(pen, px, weight);
  return pen.g.measureText(text).width;
}

/** The chip's width: "Your idea" in the label type, with its padding. */
export const chipWidth = (pen: Pen) => measure(pen, pen.copy.idea, LABEL, 600) + 12;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r0: number) {
  const r = Math.min(r0, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

type PillLook = { color?: string; border?: string; weight?: number; dash?: number[]; alpha?: number };

// a small mono label on a pill: x is its left edge, y its vertical centre
function pill(pen: Pen, text: string, x: number, y: number, look: PillLook = {}) {
  const { g, colors } = pen;
  const w = measure(pen, text, LABEL, look.weight ?? 500) + 12;
  const h = LABEL + 8;
  g.globalAlpha = look.alpha ?? 1;
  roundRect(g, x, y - h / 2, w, h, h / 2);
  g.fillStyle = colors.bg;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = look.border ?? colors.lineStrong;
  if (look.dash) g.setLineDash(look.dash);
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = look.color ?? colors.text;
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillText(text, x + 6, y + 0.5);
  g.globalAlpha = 1;
}

// a signed check: a success disc with a check, popping in by p (0 to 1)
function check(pen: Pen, cx: number, cy: number, r: number, p: number) {
  if (p <= 0) return;
  const { g, colors } = pen;
  const s = 0.6 + 0.4 * pen.easeOut(p);
  g.globalAlpha = Math.min(1, p * 1.6);
  g.fillStyle = colors.success;
  g.beginPath();
  g.arc(cx, cy, r * s, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = colors.bg;
  g.lineWidth = Math.max(1.2, r * 0.22);
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(cx - r * 0.42 * s, cy + r * 0.02 * s);
  g.lineTo(cx - r * 0.1 * s, cy + r * 0.36 * s);
  g.lineTo(cx + r * 0.48 * s, cy - r * 0.34 * s);
  g.stroke();
  g.globalAlpha = 1;
}

// a patch of the page colour over a word of the crowd, so a name drawn there reads cleanly
function cover(pen: Pen, x: number, y: number, w: number) {
  pen.g.fillStyle = pen.colors.bg;
  pen.g.fillRect(x - 1.5, y - 1.5, w + 3, pen.fontSize + 4);
}

/** The chip. `left` is its left edge and `y` its vertical centre; a ghost's is dashed and fainter. */
export function drawChip(pen: Pen, left: number, y: number, ghost: boolean, alpha = 1) {
  pill(pen, pen.copy.idea, left, Math.max(10, y), {
    color: pen.colors.text,
    border: ghost ? pen.colors.muted : pen.colors.text,
    weight: 600,
    dash: ghost ? [3, 3] : undefined,
    alpha,
  });
}

/**
 * The team at story time `T` (99 for the still frame). `clock` is the hero's clock and `back`
 * the seconds a released team takes to get home.
 */
export function drawTeam(pen: Pen, team: Team, T: number, clock: number, back: number) {
  const { g, colors, copy } = pen;
  const { centre, radius: r } = team;
  const [cx, cy] = centre;
  const released = team.released !== null;
  const rel = released ? 1 - seg(clock, team.released as number, back) : 1;
  const on = ringAlpha(T) * rel;
  // the words around the ring fade back, so the ring reads
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.arc(cx, cy + 6, r + 28 + (2 - i) * 12, 0, Math.PI * 2);
    g.globalAlpha = 0.3 * on;
    g.fillStyle = colors.bg;
    g.fill();
  }
  // the ring
  g.globalAlpha = 0.9 * on;
  g.strokeStyle = colors.lineStrong;
  g.lineWidth = 1;
  g.setLineDash([2, 4]);
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.globalAlpha = 1;
  // each name's place in the crowd stays covered while the name is away
  for (const m of team.members) cover(pen, m.homeX, m.homeY, m.word.w);
  // one ring segment per signature
  team.members.forEach((m, i) => {
    const p = memberStory(T, i, pen.easeOut).segment;
    if (p <= 0) return;
    const start = ((m.seat - 60) * Math.PI) / 180;
    g.globalAlpha = rel;
    g.strokeStyle = colors.success;
    g.lineWidth = 2;
    g.lineCap = "round";
    g.beginPath();
    g.arc(cx, cy, r, start, start + ((120 * Math.PI) / 180) * p);
    g.stroke();
    g.globalAlpha = 1;
  });
  // the names, their outlines, tags and checks
  const nameSize = team.nameSize;
  const [, bottomRight, bottomLeft] = seatAngles(3);
  team.members.forEach((m, i) => {
    const story = memberStory(T, i, pen.easeOut);
    // going home, a name turns back into a crowd name
    const homeness = released ? 1 - Math.min(1, Math.hypot(m.x - m.homeX, m.y - m.homeY) / 36) : 0;
    const ink = released ? 1 - homeness : ringAlpha(T);
    cover(pen, m.x, m.y, m.width);
    g.font = font(pen, nameSize, 500);
    g.textBaseline = "top";
    g.textAlign = "left";
    g.globalAlpha = 0.85;
    g.fillStyle = colors.muted;
    g.fillText(m.word.t, m.x, m.y);
    g.globalAlpha = ink;
    g.fillStyle = colors.text;
    g.font = font(pen, nameSize, 600);
    g.fillText(m.word.t, m.x, m.y);
    g.globalAlpha = 1;
    // the Lagoon outline: the matcher's suggestion, until the invitation goes out
    if (!released && story.outline > 0) {
      g.globalAlpha = story.outline;
      g.strokeStyle = colors.ai;
      g.lineWidth = 1.4;
      roundRect(g, m.x - 4, m.y - 3, m.width + 8, nameSize + 6, 6);
      g.stroke();
      g.globalAlpha = 1;
    }
    if (released) return;
    // the tag: the role in Lagoon, then the step in ink, then Signed with its check
    const y = m.seat === seatAngles(3)[0] ? m.y - 12 : m.y + nameSize + 12;
    let text = copy.roles[m.word.role ?? 0];
    let color = colors.ai;
    let border = colors.ai;
    if (story.tag === "invited") {
      text = m.asks ? copy.asks : copy.invited;
      color = colors.text;
      border = colors.muted;
    } else if (story.tag === "signed") {
      text = copy.signed;
      color = colors.success;
      border = colors.success;
    }
    const signed = story.tag === "signed";
    const w = measure(pen, text, LABEL, 500) + 12 + (signed ? 14 : 0);
    // the two lower tags lean outward, so they never touch; none leaves the hero
    const lean = m.seat === bottomLeft ? -18 : m.seat === bottomRight ? 18 : 0;
    const x = Math.max(6, Math.min(pen.width - w - 6, m.x + m.width / 2 - w / 2 + lean));
    g.globalAlpha = story.tagAlpha;
    pill(pen, text, x + (signed ? 14 : 0), y, { color, border, weight: 500 });
    if (signed) check(pen, x + 10, y + 0.5, 5.5, story.check);
    g.globalAlpha = 1;
  });
  // the one Lagoon caption: this is the matcher suggesting, by role
  const cap = captionAlpha(T) * rel;
  if (cap > 0) {
    const w = measure(pen, copy.suggested, LABEL, 600) + 12;
    pill(pen, copy.suggested, cx - w / 2, cy + r + 24, { color: colors.ai, border: colors.ai, alpha: cap, weight: 600 });
  }
}

/** The names near a resting pointer that hold the needed roles, outlined with their roles: no movement. */
export function drawSuggestions(pen: Pen, holders: readonly Holder[]) {
  const { g, colors } = pen;
  for (const { word, x, y } of holders) {
    cover(pen, x, y, word.w);
    g.font = font(pen, pen.fontSize, 600);
    g.textBaseline = "top";
    g.textAlign = "left";
    g.fillStyle = colors.text;
    g.fillText(word.t, x, y);
    g.strokeStyle = colors.ai;
    g.lineWidth = 1.4;
    roundRect(g, x - 4, y - 3, word.w + 8, pen.fontSize + 6, 6);
    g.stroke();
    const role = pen.copy.roles[word.role ?? 0];
    pill(pen, role, x + word.w / 2 - (measure(pen, role, LABEL, 500) + 12) / 2, y - 12, { color: colors.ai, border: colors.ai });
  }
}
