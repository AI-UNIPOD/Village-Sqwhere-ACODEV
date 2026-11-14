// Your idea gathers a team: the rules of the hero's pointer story, without any drawing. The
// pointer carries the idea as a small chip. When it pauses, the made-up builders who hold the
// roles an idea like this needs spring onto a small ring around the chip, are invited (or ask
// to join), and sign one after another. Moving the pointer lets them go home. With no pointer a
// ghost idea does the same on its own. Everything here is pure, so it is the same on every run
// and can be tested without a browser.

import { seg, zoneFade, type CrowdWord, type Rect } from "./gather";

export type Point = readonly [number, number];

/** The roles an idea needs, as the builders' role numbers: Backend, Mobile, Security. */
export const NEEDED_ROLES = [0, 1, 2] as const;
/** The Security builder asks to join, where the others are invited: a developer asking. */
const ASKING_ROLE = 2;

/** Seconds the pointer must rest before the team gathers. */
export const PAUSE = 0.25;
/** Pixels the pointer may wander and still count as resting (a hand is never perfectly still). */
export const REST_JITTER = 4;
/** Pixels from where it paused that the pointer must move to let the team go. */
export const LEAVE = 18;
/** How far from the chip a builder may be and still be suggested. */
export const SEARCH = 160;
/** Seconds idle before a pointer that is not moving gives way to the ghost idea. */
export const IDLE_GHOST = 4;
/** How fast the ghost idea wanders, in px a second at most. */
export const GHOST_SPEED = 46;

/**
 * The story, in seconds from the pause: the suggestion and the spring onto the ring together in
 * half a second, then the invitations, then the three signatures 200ms apart. The ring is closed
 * at 1.6s. A ghost holds the closed ring a little, a pointer holds it as long as it stays.
 */
export const STORY = {
  gather: 0.5,
  invite: 0.5,
  inviteStep: 0.06,
  sign: 0.9,
  signStep: 0.2,
  signDur: 0.3,
  closed: 1.6,
  ghostHold: 0.9,
};

/** Ring radii to try, biggest first: a tight clearing takes a smaller ring. */
export const RADII = [52, 44, 36] as const;
/** Where the three names sit on the ring, in degrees: top, bottom right, bottom left. */
const SEATS = [-90, 25, 155] as const;

// ---------- the pointer ----------

export type Rest = { anchor: Point; time: number };

/** How long the pointer has been resting: the time within REST_JITTER of where it settled. */
export function trackRest(rest: Rest | null, pointer: Point | null, dt: number): Rest | null {
  if (!pointer) return null;
  if (!rest || Math.hypot(pointer[0] - rest.anchor[0], pointer[1] - rest.anchor[1]) > REST_JITTER) {
    return { anchor: pointer, time: 0 };
  }
  return { anchor: rest.anchor, time: rest.time + dt };
}

export const isResting = (rest: Rest | null) => !!rest && rest.time >= PAUSE;

// The chip hangs below and to the right of the pointer's tip, like a name tag on a shared
// cursor. Near the right edge it swaps to the left so it is never cut.
const CHIP_DX = 9;
const CHIP_DY = 15;

/** The chip's left edge for a pointer at `x`. */
export function chipLeft(x: number, chipWidth: number, heroWidth: number) {
  const left = x + CHIP_DX;
  return left + chipWidth > heroWidth - 6 ? x - 7 - chipWidth : left;
}

/** The chip's centre for a pointer at `pointer`. */
export function chipCentre(pointer: Point, chipWidth: number, heroWidth: number): Point {
  return [chipLeft(pointer[0], chipWidth, heroWidth) + chipWidth / 2, pointer[1] + CHIP_DY];
}

// ---------- room for the ring ----------

/** What a ring of this radius around `centre` takes with its names, labels and caption. */
export function ringRoom(centre: Point, radius: number): Rect {
  return [centre[0] - radius - 62, centre[1] - radius - 26, centre[0] + radius + 62, centre[1] + radius + 34];
}

/**
 * Whether a rect sits inside the hero, `margin` from its edges, and clear of the areas the
 * crowd keeps clear of (the text, the square, the button), with `slack` to spare.
 */
export function roomFits(room: Rect, width: number, height: number, avoid: readonly Rect[], margin = 4, slack = 6) {
  if (room[0] < margin || room[1] < margin || room[2] > width - margin || room[3] > height - margin) return false;
  return !avoid.some(
    (q) => room[2] + slack > q[0] && room[0] - slack < q[2] && room[3] + slack > q[1] && room[1] - slack < q[3],
  );
}

/** The biggest ring that fits around `centre`, or null when none does: then nothing gathers. */
export function fittingRadius(centre: Point, fits: (room: Rect) => boolean): number | null {
  return RADII.find((r) => fits(ringRoom(centre, r))) ?? null;
}

// ---------- the team ----------

/** Where a crowd word shows now: a word that has scrolled off the left comes back from the right. */
export function wordX(word: CrowdWord, shift: number, width: number, scrolling: boolean) {
  const x = word.x + shift;
  return scrolling && x + word.w < 0 ? x + width : x;
}

export type Holder = { word: CrowdWord; x: number; y: number };

/**
 * The builders for an idea resting at `centre`: for each needed role the nearest builder who
 * holds it, within SEARCH px, skipping words the text, the square or the button hide and words
 * already taken. Two or three names, in role order; fewer than two and nobody is suggested.
 */
export function pickTeam(
  words: readonly CrowdWord[],
  centre: Point,
  shift: number,
  width: number,
  scrolling: boolean,
  fontSize: number,
  avoid: readonly Rect[],
  taken: ReadonlySet<CrowdWord> = new Set(),
): Holder[] {
  const found: Holder[] = [];
  for (const role of NEEDED_ROLES) {
    let best: (Holder & { d: number }) | null = null;
    for (const word of words) {
      if (word.role !== role || taken.has(word)) continue;
      for (const repeat of scrolling ? [0, width] : [0]) {
        const x = word.x + shift + repeat;
        if (x + word.w < 0 || x > width) continue;
        const dx = Math.max(x - centre[0], centre[0] - (x + word.w), 0);
        const dy = centre[1] - (word.y + fontSize / 2);
        const d = Math.hypot(dx, dy);
        if (d > SEARCH || zoneFade([x, word.y, x + word.w, word.y + fontSize], avoid, 0) <= 0) continue;
        if (!best || d < best.d) best = { word, x, y: word.y, d };
      }
    }
    if (best && !found.some((f) => f.word.t === best.word.t)) found.push({ word: best.word, x: best.x, y: best.y });
  }
  return found.length < 2 ? [] : found;
}

/** The ring's seats in degrees: three names take top, bottom right, bottom left; two take top and bottom left. */
export const seatAngles = (count: number): number[] => (count === 2 ? [SEATS[0], SEATS[2]] : SEATS.slice(0, count));

/** The top left of a name of this size seated at `angle` degrees on the ring. */
export function seatPoint(centre: Point, radius: number, angle: number, nameWidth: number, nameHeight: number): Point {
  const a = (angle * Math.PI) / 180;
  return [centre[0] + radius * Math.cos(a) - nameWidth / 2, centre[1] + radius * Math.sin(a) - nameHeight / 2];
}

export type Member = {
  word: CrowdWord;
  /** Where it is drawn now, and where it was when released. */
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  /** Its place in the crowd now (the crowd keeps drifting). */
  homeX: number;
  homeY: number;
  seat: number;
  width: number;
  asks: boolean;
};

export type Team = {
  centre: Point;
  radius: number;
  members: Member[];
  /** The clock when the story began and when it was released (null while it stands). */
  born: number;
  released: number | null;
  /** Where the pointer paused (null for a ghost). */
  from: Point | null;
  ghost: boolean;
  nameSize: number;
};

/** Starts the story at `clock`. `measure` gives a name's width at the name size. */
export function startTeam(
  holders: readonly Holder[],
  centre: Point,
  radius: number,
  clock: number,
  from: Point | null,
  nameSize: number,
  measure: (text: string) => number,
): Team {
  const seats = seatAngles(holders.length);
  const members = holders.map((h, i): Member => {
    const width = measure(h.word.t);
    return {
      word: h.word,
      x: h.x,
      y: h.y,
      fromX: h.x,
      fromY: h.y,
      homeX: h.x,
      homeY: h.y,
      seat: seats[i],
      width,
      asks: h.word.role === ASKING_ROLE,
    };
  });
  return { centre, radius, members, born: clock, released: null, from, ghost: from === null, nameSize };
}

/** Seconds of story at `clock`. */
export const storyTime = (team: Team, clock: number) => clock - team.born;

/** Lets the team go: each name remembers where it is, to walk back from there. */
export function releaseTeam(team: Team, clock: number) {
  if (team.released !== null) return;
  team.released = clock;
  for (const m of team.members) {
    m.fromX = m.x;
    m.fromY = m.y;
  }
}

/** Whether the team should be let go now: the pointer moved away, left, or went over a box. */
export function shouldRelease(team: Team, clock: number, pointer: Point | null, overBox: boolean) {
  if (team.released !== null) return false;
  if (team.ghost) return storyTime(team, clock) > STORY.closed + STORY.ghostHold;
  if (!pointer || overBox || !team.from) return true;
  return Math.hypot(pointer[0] - team.from[0], pointer[1] - team.from[1]) > LEAVE;
}

/** How far a released team has come home, 0 to 1, over `duration` (--dur-modal). */
export function releaseProgress(team: Team, clock: number, duration: number, ease: (x: number) => number) {
  return team.released === null ? 0 : ease(seg(clock, team.released, duration));
}

/**
 * Moves every name for this moment: from its place in the crowd to its seat while gathering
 * (the progress is `ease(seg(T, 0, STORY.gather))`, on --ease-strong), and from where it was to
 * its place in the crowd, wherever that has drifted to, when released. A name whose place
 * wrapped round the hero while it walked home is simply put there.
 */
export function placeMembers(
  team: Team,
  homes: readonly Point[],
  heroWidth: number,
  gather: number,
  back: number,
) {
  team.members.forEach((m, i) => {
    const [hx, hy] = homes[i];
    const wrapped = Math.abs(hx - m.homeX) > heroWidth / 2;
    m.homeX = hx;
    m.homeY = hy;
    if (team.released === null) {
      const [sx, sy] = seatPoint(team.centre, team.radius, m.seat, m.width, team.nameSize);
      m.x = hx + (sx - hx) * gather;
      m.y = hy + (sy - hy) * gather;
    } else if (wrapped) {
      m.x = hx;
      m.y = hy;
    } else {
      m.x = m.fromX + (hx - m.fromX) * back;
      m.y = m.fromY + (hy - m.fromY) * back;
    }
  });
}

// ---------- what each name shows at story time T ----------

export type MemberStory = {
  /** The Lagoon outline, while the matcher suggests. */
  outline: number;
  /** The tag under or over the name: its role (Lagoon), the invitation (ink), or Signed (success). */
  tag: "role" | "invited" | "signed";
  tagAlpha: number;
  /** The check beside "Signed", popping in (0 to 1). */
  check: number;
  /** How much of this name's ring segment is drawn (0 to 1), on the easing given. */
  segment: number;
};

const inviteAt = (i: number) => STORY.invite + i * STORY.inviteStep;
const signAt = (i: number) => STORY.sign + i * STORY.signStep;

export function memberStory(T: number, i: number, ease: (x: number) => number): MemberStory {
  const check = seg(T, signAt(i) + 0.1, 0.2);
  return {
    outline: seg(T, 0, 0.15) * (1 - seg(T, inviteAt(i), 0.15)),
    tag: check > 0 ? "signed" : T >= inviteAt(i) ? "invited" : "role",
    tagAlpha: seg(T, 0, 0.15),
    check,
    segment: ease(seg(T, signAt(i), STORY.signDur)),
  };
}

/** The one Lagoon caption, "Suggested by role": up while the matcher suggests, gone at the invitations. */
export const captionAlpha = (T: number) => seg(T, 0.05, 0.15) * (1 - seg(T, STORY.invite, 0.15));

/** The ring and the words fading back around it come in over the first fifth of a second. */
export const ringAlpha = (T: number) => seg(T, 0, 0.2);

// ---------- the ghost idea ----------

export type Ghost = {
  /** The chip's centre, and where it is going. */
  x: number;
  y: number;
  alpha: number;
  state: "new" | "wander" | "rest" | "leave";
  t: number;
  target: Point;
  spot: Point | null;
};

export const newGhost = (): Ghost => ({ x: -99, y: -99, alpha: 0, state: "new", t: 0, target: [0, 0], spot: null });

/** A clear spot for the ghost's ring, at least 220px from `from`, or null when the crowd has none. */
export function pickGhostSpot(
  rnd: () => number,
  width: number,
  height: number,
  from: Point | null,
  fits: (centre: Point) => boolean,
): Point | null {
  const margin = RADII[0] + 72;
  for (let i = 0; i < 70; i++) {
    const x = margin + rnd() * (width - 2 * margin);
    const y = RADII[0] + 38 + rnd() * (height - 2 * (RADII[0] + 44));
    if (!fits([x, y])) continue;
    if (from && Math.hypot(x - from[0], y - from[1]) < 220) continue;
    return [x, y];
  }
  return null;
}

/** One step of the ghost's wander: it slows into its spot and is there within 4px. */
export function wanderStep(ghost: Ghost, dt: number): boolean {
  const dx = ghost.target[0] - ghost.x;
  const dy = ghost.target[1] - ghost.y;
  const d = Math.hypot(dx, dy);
  const speed = Math.min(GHOST_SPEED, d * 2.2);
  if (d > 1.5) {
    ghost.x += (dx / d) * speed * dt;
    ghost.y += (dy / d) * speed * dt;
  }
  return d < 4;
}

type GhostEnv = {
  rnd: () => number;
  width: number;
  height: number;
  /** A clear spot for a ring, away from `from`. */
  pick: (from: Point | null) => Point | null;
  /** Starts the story at the ghost's chip; false when too few names are near. */
  gather: () => boolean;
  /** The team of this ghost, if any, and whether it has been let go. */
  team: { released: boolean } | null;
};

/** One step of the ghost: pick a spot, wander there, rest a quarter second, gather, leave. */
export function stepGhost(ghost: Ghost, dt: number, env: GhostEnv) {
  if (ghost.state === "new") {
    const spot = env.pick(ghost.spot);
    if (!spot) {
      ghost.t += dt;
      return;
    }
    ghost.spot = spot;
    ghost.target = spot;
    const angle = env.rnd() * Math.PI * 2;
    ghost.x = Math.max(30, Math.min(env.width - 30, spot[0] + Math.cos(angle) * 130));
    ghost.y = Math.max(20, Math.min(env.height - 20, spot[1] + Math.sin(angle) * 80));
    ghost.state = "wander";
    ghost.t = 0;
  }
  ghost.alpha = Math.min(1, ghost.alpha + dt * 2.2);
  if (ghost.state === "wander") {
    if (wanderStep(ghost, dt)) {
      ghost.state = "rest";
      ghost.t = 0;
    }
  } else if (ghost.state === "rest") {
    ghost.t += dt;
    if (!env.team && ghost.t > PAUSE) env.gather();
    if (!env.team && ghost.t > 3) ghost.state = "new"; // nobody here, try another place
    if (env.team?.released) {
      ghost.state = "leave";
      ghost.t = 0;
    }
  } else {
    ghost.t += dt;
    if (ghost.t > 0.2 && !env.team) ghost.state = "new";
  }
}
