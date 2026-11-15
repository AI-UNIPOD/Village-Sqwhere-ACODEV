import { expect, test } from "vitest";

import { rng, type CrowdWord, type Rect } from "./gather";
import {
  GHOST_SPEED,
  LEAVE,
  PAUSE,
  RADII,
  STORY,
  captionAlpha,
  chipCentre,
  chipLeft,
  fittingRadius,
  fittingRing,
  isResting,
  memberStory,
  newGhost,
  pickGhostSpot,
  pickTeam,
  placeMembers,
  releaseProgress,
  releaseTeam,
  ringRoom,
  roomFits,
  seatAngles,
  seatPoint,
  shouldRelease,
  startTeam,
  stepGhost,
  storyTime,
  trackRest,
  wanderStep,
  wordX,
  type Point,
  type Rest,
} from "./hero-team";

const linear = (x: number) => x;

// ---------- the pointer pauses ----------

// the pointer reports `at` for `seconds`, 16ms at a time
function rest(from: Rest | null, at: Point, seconds: number) {
  let state = from;
  for (let t = 0; t < seconds - 1e-9; t += 0.016) state = trackRest(state, at, 0.016);
  return state;
}

test("the pointer has paused after a quarter of a second, not before", () => {
  expect(PAUSE).toBe(0.25);
  expect(isResting(rest(null, [100, 100], 0.2))).toBe(false);
  expect(isResting(rest(null, [100, 100], 0.3))).toBe(true);
});

test("a hand that shakes a little still counts as resting, a real move starts the count again", () => {
  let state = rest(null, [100, 100], 0.2);
  state = rest(state, [102, 101], 0.1); // 2px away: the same rest
  expect(isResting(state)).toBe(true);
  state = rest(state, [140, 100], 0.1); // a real move
  expect(isResting(state)).toBe(false);
  expect(state?.anchor).toEqual([140, 100]);
});

test("a slow drift of the pointer is movement: the rest is measured from where it settled", () => {
  let state: Rest | null = null;
  // 1px every 32ms is slow, but after 0.5s it is 15px from where it began
  for (let i = 0; i < 16; i++) state = trackRest(state, [100 + i, 100], 0.032);
  expect(isResting(state)).toBe(false);
});

test("no pointer, no rest", () => {
  expect(trackRest(rest(null, [10, 10], 1), null, 0.016)).toBeNull();
});

// ---------- the chip hangs from the pointer's tip ----------

test("the chip sits just below and to the right of the pointer's tip", () => {
  expect(chipLeft(200, 66, 1200)).toBe(209);
  const centre = chipCentre([200, 300], 66, 1200);
  expect(centre).toEqual([209 + 33, 315]);
});

test("near the right edge the chip swaps to the left of the tip, so it is never cut", () => {
  const left = chipLeft(1190, 66, 1200);
  expect(left + 66).toBeLessThanOrEqual(1190);
  expect(left).toBeGreaterThan(1000);
});

// ---------- room for the ring ----------

const HERO = { width: 1200, height: 700 };
const BOX: Rect = [300, 200, 700, 500];

test("a ring needs its names, labels and caption inside the hero and clear of the boxes", () => {
  const room = ringRoom([200, 100], 52);
  expect(roomFits(room, HERO.width, HERO.height, [BOX])).toBe(true);
  // over the box
  expect(roomFits(ringRoom([400, 350], 52), HERO.width, HERO.height, [BOX])).toBe(false);
  // too close to the box: within the slack
  expect(roomFits(ringRoom([300 - 52 - 62 - 3, 350], 52), HERO.width, HERO.height, [BOX])).toBe(false);
  // past the hero's edge
  expect(roomFits(ringRoom([20, 100], 52), HERO.width, HERO.height, [BOX])).toBe(false);
});

test("a tight clearing takes a smaller ring, and no clearing at all takes none", () => {
  const fitsAround = (box: Rect) => (room: Rect) => roomFits(room, HERO.width, HERO.height, [box]);
  expect(fittingRadius([200, 100], fitsAround(BOX))).toBe(RADII[0]);
  // a box that leaves 10px less above than the biggest ring needs
  const low: Rect = [0, 100 + 52 + 34 - 10 + 6, 1200, 700];
  const r = fittingRadius([600, 100], fitsAround(low));
  expect(r).not.toBeNull();
  expect(r as number).toBeLessThan(RADII[0]);
  // the whole hero is a box
  expect(fittingRadius([600, 100], fitsAround([0, 0, 1200, 700]))).toBeNull();
});

test("when the clearing is tight the ring slides up or down off the chip, at most 28px, before it shrinks", () => {
  const fitsAround = (box: Rect) => (room: Rect) => roomFits(room, HERO.width, HERO.height, [box]);
  // room for the biggest ring only if it slides 14px up
  const low: Rect = [0, 100 + 52 + 34 - 14 + 6, 1200, 700];
  const ring = fittingRing([600, 100], fitsAround(low));
  expect(ring).toEqual({ centre: [600, 86], radius: 52 });
  // centred when there is room, and the slide is never more than 28px
  expect(fittingRing([200, 100], fitsAround(BOX))).toEqual({ centre: [200, 100], radius: 52 });
  const tight = fittingRing([600, 100], fitsAround([0, 100 + 52 + 34 - 40 + 6, 1200, 700]));
  expect(tight).not.toBeNull();
  expect(Math.abs((tight as { centre: Point }).centre[1] - 100)).toBeLessThanOrEqual(28);
  expect(fittingRing([600, 100], fitsAround([0, 0, 1200, 700]))).toBeNull();
});

// ---------- who is suggested ----------

const FS = 10;
const word = (t: string, x: number, y: number, role?: number): CrowdWord => ({
  t,
  x,
  y,
  w: t.length * 6,
  role,
});
const CROWD: CrowdWord[] = [
  word("react", 100, 100),
  word("Hamza", 150, 90, 0), // Backend
  word("Joaquim", 190, 150, 1), // Mobile
  word("Kidist", 120, 40, 2), // Security
  word("Kiprono", 400, 300, 0), // Backend, far away
  word("Aminata", 130, 120, 4), // Design: not a needed role
];

test("suggests the nearest builder for each needed role: Backend, Mobile, Security", () => {
  const team = pickTeam(CROWD, [150, 100], 0, 1200, false, FS, []);
  expect(team.map((h) => h.word.t)).toEqual(["Hamza", "Joaquim", "Kidist"]);
});

test("a role holder far away is not suggested, and with fewer than two nobody is", () => {
  // only Kiprono (Backend) is within reach of this spot, but he is 160px+ away from the others
  expect(pickTeam([CROWD[4]], [150, 100], 0, 1200, false, FS, [])).toEqual([]);
  const two = pickTeam(CROWD.slice(1, 3), [150, 100], 0, 1200, false, FS, []);
  expect(two.map((h) => h.word.t)).toEqual(["Hamza", "Joaquim"]);
  expect(pickTeam([CROWD[1]], [150, 100], 0, 1200, false, FS, [])).toEqual([]);
});

test("picks the nearest of two builders who hold the same role", () => {
  const crowd = [word("Hamza", 150, 90, 0), word("Kiprono", 200, 100, 0), word("Joaquim", 190, 150, 1)];
  const team = pickTeam(crowd, [210, 105], 0, 1200, false, FS, []);
  expect(team.map((h) => h.word.t)).toEqual(["Kiprono", "Joaquim"]);
});

test("a name hidden behind a box, or already taken, is not suggested", () => {
  const hidden: Rect[] = [[140, 80, 200, 110]]; // covers Hamza
  expect(pickTeam(CROWD, [150, 100], 0, 1200, false, FS, hidden).map((h) => h.word.t)).toEqual(["Joaquim", "Kidist"]);
  const taken = new Set([CROWD[2]]);
  expect(pickTeam(CROWD, [150, 100], 0, 1200, false, FS, [], taken).map((h) => h.word.t)).toEqual(["Hamza", "Kidist"]);
});

test("the crowd's scroll is followed: names are found where they are now", () => {
  const team = pickTeam(CROWD, [150 - 40, 100], -40, 1200, true, FS, []);
  expect(team.map((h) => h.word.t)).toEqual(["Hamza", "Joaquim", "Kidist"]);
  expect(team[0].x).toBe(110);
});

test("a name that scrolled off the left comes back from the right, and is found there", () => {
  const w = word("Hamza", 10, 90, 0);
  expect(wordX(w, -60, 1200, true)).toBe(1150);
  expect(wordX(w, -60, 1200, false)).toBe(-50);
  const found = pickTeam([w, word("Joaquim", 1100, 100, 1)], [1150, 100], -60, 1200, true, FS, []);
  expect(found.map((h) => h.word.t)).toEqual(["Hamza", "Joaquim"]);
});

// ---------- the ring ----------

test("three names take the top, bottom right and bottom left of the ring, two take top and bottom left", () => {
  expect(seatAngles(3)).toEqual([-90, 25, 155]);
  expect(seatAngles(2)).toEqual([-90, 155]);
});

test("a seat is on the ring: the name's centre is one radius from the centre", () => {
  for (const angle of seatAngles(3)) {
    const [x, y] = seatPoint([300, 200], 52, angle, 40, 12);
    expect(Math.hypot(x + 20 - 300, y + 6 - 200)).toBeCloseTo(52, 6);
  }
  // the top seat is straight above the centre
  expect(seatPoint([300, 200], 52, -90, 40, 12)[0]).toBeCloseTo(280, 6);
});

// ---------- the story ----------

test("the story is fast: closed by 1.6s, the suggestion and the gather in half a second", () => {
  expect(STORY.gather).toBe(0.5);
  expect(STORY.invite).toBe(0.5);
  // the last signature starts at 1.3s and takes 0.3s
  expect(STORY.sign + 2 * STORY.signStep + STORY.signDur).toBeCloseTo(STORY.closed, 9);
  expect(STORY.closed).toBe(1.6);
});

test("the three signatures start 200ms apart", () => {
  const starts = [0, 1, 2].map((i) => {
    for (let t = 0; t < 3; t += 0.001) if (memberStory(t, i, linear).segment > 0) return t;
    return -1;
  });
  expect(starts[1] - starts[0]).toBeCloseTo(0.2, 2);
  expect(starts[2] - starts[1]).toBeCloseTo(0.2, 2);
  expect(starts[0]).toBeCloseTo(STORY.sign, 2);
});

test("first the role in Lagoon with an outline, then the invitation, then Signed with a check", () => {
  const at = (t: number) => memberStory(t, 0, linear);
  expect(at(0.3)).toMatchObject({ tag: "role" });
  expect(at(0.3).outline).toBe(1);
  expect(at(0.45).check).toBe(0);
  expect(at(0.7)).toMatchObject({ tag: "invited", outline: 0 });
  expect(at(1.2)).toMatchObject({ tag: "signed" });
  expect(at(1.25).check).toBe(1);
  expect(at(1.7).segment).toBe(1);
});

test("the Lagoon caption shows while the matcher suggests and is gone when the invitations go out", () => {
  expect(captionAlpha(0)).toBe(0);
  expect(captionAlpha(0.25)).toBe(1);
  expect(captionAlpha(STORY.invite + 0.2)).toBe(0);
  expect(captionAlpha(1.6)).toBe(0);
});

test("the labels are still all there 600ms after the ring has closed", () => {
  for (const i of [0, 1, 2]) {
    const s = memberStory(STORY.closed + 0.6, i, linear);
    expect(s.tag).toBe("signed");
    expect(s.check).toBe(1);
    expect(s.segment).toBe(1);
    expect(s.tagAlpha).toBe(1);
  }
});

// ---------- the team: gather, stay, go home ----------

const HOLDERS = [
  { word: word("Hamza", 150, 90, 0), x: 150, y: 90 },
  { word: word("Joaquim", 190, 150, 1), x: 190, y: 150 },
  { word: word("Kidist", 120, 40, 2), x: 120, y: 40 },
];
const newTeam = (from: Point | null = [300, 300], clock = 5) =>
  startTeam(HOLDERS, [300, 300], 52, clock, from, 11, (t) => t.length * 6.5);

test("starts with the names where they are, seated on the ring, and the Security builder asks to join", () => {
  const t = newTeam();
  expect(t.members.map((m) => [m.word.t, m.seat, m.asks])).toEqual([
    ["Hamza", -90, false],
    ["Joaquim", 25, false],
    ["Kidist", 155, true],
  ]);
  expect(t.members[0].x).toBe(150);
  expect(t.ghost).toBe(false);
  expect(newTeam(null).ghost).toBe(true);
});

test("gathering moves each name from its place to its seat, exactly there at the end", () => {
  const t = newTeam();
  const homes = HOLDERS.map((h) => [h.x, h.y] as const);
  placeMembers(t, homes, 1200, 0, 0);
  expect([t.members[0].x, t.members[0].y]).toEqual([150, 90]);
  placeMembers(t, homes, 1200, 0.5, 0);
  const seat = seatPoint(t.centre, 52, -90, t.members[0].width, 11);
  expect(t.members[0].x).toBeCloseTo((150 + seat[0]) / 2, 6);
  placeMembers(t, homes, 1200, 1, 0);
  expect(t.members[0].x).toBeCloseTo(seat[0], 6);
  expect(t.members[0].y).toBeCloseTo(seat[1], 6);
});

test("a name follows its place while it gathers, as the crowd keeps drifting", () => {
  const t = newTeam();
  placeMembers(t, HOLDERS.map((h) => [h.x - 16, h.y] as const), 1200, 0, 0);
  expect(t.members[0].x).toBe(134);
});

test("moving the pointer more than 18px lets the team go, a small shake does not", () => {
  expect(LEAVE).toBe(18);
  const t = newTeam([300, 300]);
  expect(shouldRelease(t, 6, [305, 303], false)).toBe(false);
  expect(shouldRelease(t, 6, [300 + 19, 300], false)).toBe(true);
  expect(shouldRelease(t, 6, null, false)).toBe(true); // the pointer left
  expect(shouldRelease(t, 6, [300, 300], true)).toBe(true); // it went over a box
});

test("a pointer's team stays as long as the pointer stays: the labels never time out", () => {
  const t = newTeam([300, 300], 5);
  expect(shouldRelease(t, 5 + STORY.closed + 60, [300, 300], false)).toBe(false);
});

test("a ghost's team holds the closed ring for 0.9s and then lets go", () => {
  const t = newTeam(null, 5);
  expect(shouldRelease(t, 5 + STORY.closed + 0.8, null, false)).toBe(false);
  expect(shouldRelease(t, 5 + STORY.closed + STORY.ghostHold + 0.01, null, false)).toBe(true);
});

test("going home takes --dur-modal: from where each name was, to its place now", () => {
  const t = newTeam();
  const homes = HOLDERS.map((h) => [h.x, h.y] as const);
  placeMembers(t, homes, 1200, 1, 0);
  const seatX = t.members[0].x;
  releaseTeam(t, 10);
  expect(t.released).toBe(10);
  expect(releaseProgress(t, 10, 0.22, linear)).toBe(0);
  expect(releaseProgress(t, 10.11, 0.22, linear)).toBeCloseTo(0.5, 6);
  expect(releaseProgress(t, 10.22, 0.22, linear)).toBe(1);
  placeMembers(t, homes, 1200, 1, 0.5);
  expect(t.members[0].x).toBeCloseTo((seatX + 150) / 2, 6);
  placeMembers(t, homes, 1200, 1, 1);
  expect(t.members[0].x).toBeCloseTo(150, 6);
  // releasing twice changes nothing
  releaseTeam(t, 99);
  expect(t.released).toBe(10);
});

test("a name whose place wrapped round the hero while it walked home is put there", () => {
  const t = newTeam();
  const homes = HOLDERS.map((h) => [h.x, h.y] as const);
  placeMembers(t, homes, 1200, 1, 0);
  releaseTeam(t, 10);
  placeMembers(t, [[1180, 90], homes[1], homes[2]], 1200, 1, 0.3);
  expect(t.members[0].x).toBe(1180);
});

test("story time counts from the pause", () => {
  expect(storyTime(newTeam([1, 1], 5), 6.25)).toBeCloseTo(1.25, 9);
});

// ---------- the ghost idea ----------

test("the ghost wanders slowly, at 46px a second at most, and slows into its spot", () => {
  const ghost = { ...newGhost(), x: 0, y: 0, target: [400, 0] as Point };
  wanderStep(ghost, 1);
  expect(ghost.x).toBeCloseTo(GHOST_SPEED, 6);
  const near = { ...newGhost(), x: 380, y: 0, target: [400, 0] as Point };
  const before = near.x;
  wanderStep(near, 0.1);
  expect(near.x - before).toBeLessThan(GHOST_SPEED * 0.1);
  expect(wanderStep({ ...newGhost(), x: 398, y: 0, target: [400, 0] }, 0.1)).toBe(true);
});

test("the ghost picks a spot that fits and is far from the last one, or none when nothing fits", () => {
  const fits = (c: Point) => roomFits(ringRoom(c, RADII[0]), 1200, 700, [BOX], 8, 14);
  const spot = pickGhostSpot(rng(1), 1200, 700, [100, 100], fits);
  expect(spot).not.toBeNull();
  expect(fits(spot as Point)).toBe(true);
  expect(Math.hypot((spot as Point)[0] - 100, (spot as Point)[1] - 100)).toBeGreaterThanOrEqual(220);
  expect(pickGhostSpot(rng(1), 1200, 700, null, () => false)).toBeNull();
});

test("in a narrow stage the ghost settles for a nearer spot, so it can go on repeating the story", () => {
  // a 360px phone: the band leaves only about 150px of width for the ring's centre
  const band = (c: Point) => c[1] > 300 && c[1] < 312;
  const from: Point = [180, 306];
  const spot = pickGhostSpot(rng(5), 360, 998, from, band);
  expect(spot).not.toBeNull();
  expect(band(spot as Point)).toBe(true);
  // 220px away is impossible here, so it is as far as the width allows
  expect(Math.hypot((spot as Point)[0] - from[0], (spot as Point)[1] - from[1])).toBeLessThan(220);
});

test("the ghost picks a spot, wanders there, rests a quarter second, gathers, leaves, picks another", () => {
  const ghost = newGhost();
  let gathered = 0;
  let team: { released: boolean } | null = null;
  const spots: Point[] = [[400, 100], [900, 600]];
  const env = () => ({
    rnd: rng(3),
    width: 1200,
    height: 700,
    pick: () => spots.shift() ?? null,
    gather: () => {
      gathered++;
      team = { released: false };
      return true;
    },
    team,
  });
  const states: string[] = [];
  for (let i = 0; i < 4000; i++) {
    stepGhost(ghost, 0.016, env());
    if (states[states.length - 1] !== ghost.state) states.push(ghost.state);
    if (ghost.state === "rest" && team && ghost.t > 2) (team as { released: boolean }).released = true;
    if (ghost.state === "leave" && ghost.t > 0.1) team = null;
  }
  expect(states.slice(0, 5)).toEqual(["wander", "rest", "leave", "new", "wander"]);
  expect(gathered).toBeGreaterThanOrEqual(2);
});

test("the ghost tries another place when nobody is near", () => {
  const ghost = newGhost();
  const spots: Point[] = [[400, 100], [900, 600]];
  let picks = 0;
  for (let i = 0; i < 2000; i++) {
    stepGhost(ghost, 0.016, {
      rnd: rng(3),
      width: 1200,
      height: 700,
      pick: () => {
        picks++;
        return spots[(picks - 1) % 2];
      },
      gather: () => false,
      team: null,
    });
  }
  expect(picks).toBeGreaterThan(1);
});
