"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

import { LOGO_PATHS, Logo } from "../logo";
import {
  FADE,
  STEP,
  TWIN,
  at,
  crowdFontSize,
  footprints,
  layoutCrowd,
  nameFontSize,
  parseEasing,
  parseSeconds,
  planCycle,
  rng,
  runsFromAlpha,
  scrollOffset,
  seg,
  zoneFade,
  type CrowdWord,
  type Cycle,
  type Rect,
  type Run,
} from "./gather";
import styles from "./gather-hero.module.css";
import { ghostStage, heroAvoid, heroGeometry, type HeroGeometry } from "./hero-layout";
import type { HeroTeamCopy } from "./hero-team-copy";
import { chipWidth, drawChip, drawSuggestions, drawTeam, measure, type Pen } from "./hero-team-draw";
import {
  IDLE_GHOST,
  chipCentre,
  chipLeft,
  fittingRadius,
  fittingRing,
  isResting,
  newGhost,
  pickGhostSpot,
  pickTeam,
  placeMembers,
  releaseProgress,
  releaseTeam,
  ringRoom,
  roomFits,
  shouldRelease,
  startTeam,
  stepGhost,
  storyTime,
  STORY,
  trackRest,
  wordX,
  type Ghost,
  type Holder,
  type Point,
  type Rest,
  type Team,
} from "./hero-team";
import { motionOn, setMotion, subscribeMotion } from "./motion";

type GatherHeroProps = {
  /** The text block: headline, sentence and buttons. */
  children: ReactNode;
  labelledBy: string;
  /** The motion button's labels, in the page's language: what pressing it does. */
  labels: { pause: string; play: string };
  /** The words the crowd draws when your idea gathers a team, in the page's language. */
  team: HeroTeamCopy;
};

// the hero reacts to a pointer only where one can hover: never to a finger
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

// The logo drawn onto the 32 by 32 grid, read back as the filled runs of each row: the cells the
// country names walk into. Empty when the browser cannot draw, and then nothing walks.
function logoRuns(): Run[] {
  try {
    const grid = document.createElement("canvas");
    grid.width = grid.height = 32;
    const ctx = grid.getContext("2d");
    if (!ctx) return [];
    LOGO_PATHS.forEach((d) => ctx.fill(new Path2D(d)));
    return runsFromAlpha(ctx.getImageData(0, 0, 32, 32).data);
  } catch {
    return [];
  }
}

// The hero: text on one side and the 32 by 32 square the logo is drawn on, inside a crowd of
// small words. Country names walk out of the crowd into the V, the real logo fades in where
// they stand, and they walk back out. A port of the approved B3v landing page: where each part
// sits follows the width of the page, and the loop runs only while it is on screen, the tab is
// visible and motion is on (see motion.ts: the visitor's choice, else the system setting).
// Over the crowd the pointer carries your idea as a chip; when it pauses, the builders who hold
// the roles it needs gather around it (hero-team.ts). Without a pointer a ghost idea does it.
export function GatherHero({ children, labelledBy, labels, team: teamCopy }: GatherHeroProps) {
  const hero = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const play = useRef<HTMLButtonElement>(null);
  // the effect runs once; the words it draws follow the page's language through this
  const copyRef = useRef(teamCopy);
  const redraw = useRef<() => void>(() => {});
  useEffect(() => {
    copyRef.current = teamCopy;
    redraw.current();
  }, [teamCopy]);
  // the button's label; before the script has run the button is hidden, so the server value
  // only has to be something
  const playing = useSyncExternalStore(subscribeMotion, motionOn, () => true);

  useLayoutEffect(() => {
    const heroEl = hero.current;
    const copyEl = copy.current;
    const squareEl = square.current;
    const canvasEl = canvas.current;
    const treeEl = tree.current;
    const playEl = play.current;
    if (!heroEl || !copyEl || !squareEl || !canvasEl || !treeEl || !playEl) return;

    const g = canvasEl.getContext("2d");
    const crowdCanvas = document.createElement("canvas");
    const cg = crowdCanvas.getContext("2d");
    // the scrolling crowd: the words drawn once (tile), and what to keep clear (mask)
    const tile = document.createElement("canvas");
    const tg = tile.getContext("2d");
    const mask = document.createElement("canvas");
    const mg = mask.getContext("2d");
    // the effects layer: the chip, the twin words and the gathering team, repainted only while
    // one of them is there, and put on the crowd under the walking names
    const fxLayer = document.createElement("canvas");
    const fg = fxLayer.getContext("2d");
    const runs = logoRuns();
    const fine = window.matchMedia(FINE_POINTER).matches;
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    // Without a drawing surface the hero keeps its still frame: the square and the logo.
    let animated = !!g && !!cg;
    // whether the hero moves now (motion.ts), and whether it was last laid out still: motion off
    // at load gives the still composition, motion turned off later freezes it where it is
    let moving = motionOn();
    const state = {
      still: !moving,
      visible: !document.hidden,
      onscreen: true,
      clock: 0,
      // the story's own clock: the cycle of walking names restarts `clock`, a team must not
      story: 0,
      last: null as number | null,
      pointer: null as Point | null,
      // seconds since the pointer last moved
      idle: 0,
      rest: null as Rest | null,
      // the pause already tried for a team, so a pause with no room is not tried every frame
      tried: null as Point | null,
      cycle: 0,
      // the background drift has its own clock: the walking names restart theirs every cycle
      driftClock: 0,
    };
    // your idea gathering a team: the team on its ring, the ghost idea, and what a resting
    // pointer suggests while the hero is still
    let team: Team | null = null;
    let ghost: Ghost | null = null;
    let ghostSpots = 0;
    let suggestions: Holder[] = [];
    let walkBoxes: Rect[] = [];
    let fxDrawn = false;
    let geo: HeroGeometry | null = null;
    let heroWidth = 0;
    let avoid: readonly Rect[] = [];
    let stage: Rect | null = null;
    let words: CrowdWord[] = [];
    let plan: Cycle | null = null;
    let dpr = 1;
    let mono = "";
    let colors = { lineStrong: "", text: "", muted: "", bg: "", ai: "", success: "" };
    // the easing and the time of the team's story: without the tokens nothing gathers
    let storyTokens: { strong: (x: number) => number; out: (x: number) => number; modal: number } | null =
      null;
    let drift: { cycle: number; distance: number; feather: number; ease: (x: number) => number } | null =
      null;
    let shift = 0;
    let paintedShift = Number.NaN;
    // whether this layout scrolls: the tokens are there, motion was on, the browser can draw
    let scrolling = false;
    let raf = 0;
    let lastWidth = -1;
    let lastViewportHeight = -1;

    const running = () =>
      animated && moving && state.visible && state.onscreen;

    // the canvas cannot read CSS variables, so take the theme's colours and font from the page
    function readTheme() {
      if (!heroEl) return;
      const cs = getComputedStyle(heroEl);
      const token = (name: string) => cs.getPropertyValue(name).trim();
      colors = {
        lineStrong: token("--line-strong"),
        text: token("--text"),
        muted: token("--text-muted"),
        bg: token("--bg"),
        ai: token("--ai"),
        success: token("--success"),
      };
      mono = token("--mono");

      // the scroll uses the design system's motion tokens only (--space-8 every --dur-drift, on
      // --ease-linear); without them the crowd stays still
      const root = getComputedStyle(document.documentElement);
      const rootToken = (name: string) => root.getPropertyValue(name).trim();
      const cycle = parseSeconds(rootToken("--dur-drift"));
      const ease = parseEasing(rootToken("--ease-linear"));
      const distance = parseFloat(rootToken("--space-8"));
      const feather = parseFloat(rootToken("--space-3"));
      drift =
        cycle && ease && distance > 0
          ? { cycle, distance, feather: feather > 0 ? feather : 0, ease }
          : null;

      // the team springs onto its ring on --ease-strong, signs on --ease-out, and goes home
      // over --dur-modal
      const strong = parseEasing(rootToken("--ease-strong"));
      const out = parseEasing(rootToken("--ease-out"));
      const modal = parseSeconds(rootToken("--dur-modal"));
      storyTokens = strong && out && modal ? { strong, out, modal } : null;
    }

    // what the drift is doing, for tests and debugging: on or off
    function markDrift() {
      const value = !animated || !scrolling || !moving ? "off" : "on";
      if (heroEl && heroEl.getAttribute("data-drift") !== value) heroEl.setAttribute("data-drift", value);
    }

    // the button shows whenever something can move, also while it is off (it turns it on)
    function showButton() {
      if (playEl) playEl.style.display = animated ? "inline-flex" : "none";
    }

    // the note under the actions ("coming soon") is in the text's flow, so the box's height
    // (and with it the gap, the centring and the clear zone in the crowd) includes it; it starts
    // where the action that owns it starts (the one whose data-note is the note's id), or at
    // the first action when none does
    function placeNote(pad: number) {
      if (!copyEl) return;
      const note = copyEl.querySelector<HTMLElement>("[data-hero-note]");
      const owner = Array.from(copyEl.querySelectorAll<HTMLElement>("[data-note]")).find(
        (el) => el.dataset.note === note?.id,
      );
      const noteStart = owner ?? copyEl.querySelector<HTMLElement>("button, a");
      if (note && noteStart) note.style.marginLeft = `${Math.max(0, noteStart.offsetLeft - pad)}px`;
    }

    function layout() {
      if (!heroEl || !copyEl || !squareEl || !canvasEl || !treeEl || !playEl) return;
      const width = heroEl.clientWidth;
      state.still = !moving;
      showButton();
      const style = getComputedStyle(copyEl);
      const pad = parseFloat(style.paddingLeft) || 0;
      const hg = heroGeometry({
        width,
        viewportHeight: window.innerHeight,
        navHeight: document.querySelector<HTMLElement>("[data-site-header]")?.offsetHeight ?? 0,
        copyPad: pad,
        measure: parseFloat(style.getPropertyValue("--hero-measure")) || undefined,
        playWidth: playEl.offsetWidth || undefined,
        measureCopy: (left, copyWidth, stacked) => {
          // stacked, the text is centred (the centring changes how the headline wraps)
          copyEl.classList.toggle(styles.center, stacked);
          copyEl.style.left = `${left}px`;
          copyEl.style.width = `${copyWidth}px`;
          copyEl.style.maxWidth = "none";
          placeNote(pad);
          return copyEl.offsetHeight;
        },
      });
      geo = hg;
      heroWidth = width;
      copyEl.style.top = `${hg.copyTop}px`;
      heroEl.style.height = `${hg.height}px`;
      squareEl.style.cssText = `left:${hg.x}px;top:${hg.y}px;width:${hg.square}px;height:${hg.square}px;background-size:${hg.cell}px ${hg.cell}px`;
      treeEl.style.left = `${hg.x}px`;
      treeEl.style.top = `${hg.y}px`;
      treeEl.style.width = `${hg.square}px`;
      treeEl.style.height = `${hg.square}px`;
      playEl.style.left = `${hg.playX}px`;
      playEl.style.top = `${hg.playY}px`;
      heroEl.setAttribute("data-ready", "");
      lastWidth = width;
      lastViewportHeight = window.innerHeight;
      if (!animated) {
        treeEl.style.opacity = "1";
        return;
      }

      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const surface of [canvasEl, crowdCanvas, tile, mask, fxLayer]) {
        surface.width = Math.round(width * dpr);
        surface.height = Math.round(hg.height * dpr);
      }
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${hg.height}px`;
      avoid = heroAvoid(hg);
      stage = ghostStage(hg);
      scrolling = !!drift && !state.still && !!tg && !!mg;
      // A scrolling crowd fills the hero evenly and a fixed mask keeps the text, the square and
      // the button clear, so no empty patch travels with it. A still crowd is laid out around
      // them, as in the approved design.
      words = layoutCrowd({
        width,
        height: hg.height,
        centerX: hg.x + hg.square / 2,
        centerY: hg.y + hg.square / 2,
        square: hg.square,
        fontSize: crowdFontSize(hg.cell),
        avoid: scrolling ? [] : avoid,
      });
      paintTile();
      paintMask();
      paintedShift = Number.NaN;
      newCycle();
      // the story starts over on the new layout; frozen, it is one finished ring in a clear spot
      team = null;
      ghost = null;
      suggestions = [];
      state.rest = null;
      state.tried = null;
      if (!moving) stillTeam();
    }

    // the crowd's words, drawn once per layout or theme
    function paintTile() {
      if (!geo || !tg) return;
      tg.setTransform(dpr, 0, 0, dpr, 0, 0);
      tg.clearRect(0, 0, heroWidth, geo.height);
      const size = crowdFontSize(geo.cell);
      tg.textBaseline = "top";
      // builders a little stronger than words
      for (const w of words) {
        const person = w.role !== undefined;
        tg.font = `${person ? 500 : 400} ${size}px ${mono}`;
        tg.fillStyle = person ? colors.muted : colors.lineStrong;
        tg.globalAlpha = person ? 0.85 : 0.6;
        tg.fillText(w.t, w.x, w.y);
      }
      tg.globalAlpha = 1;
    }

    // Where scrolling words may show: everywhere but the text, the square and the button, with
    // soft edges (--space-3). Opaque in the theme's text colour; only its alpha is used.
    function paintMask() {
      if (!geo || !mg || !scrolling) return;
      mg.setTransform(1, 0, 0, 1, 0, 0);
      mg.globalCompositeOperation = "source-over";
      mg.clearRect(0, 0, mask.width, mask.height);
      mg.fillStyle = colors.text;
      mg.fillRect(0, 0, mask.width, mask.height);
      mg.globalCompositeOperation = "destination-out";
      mg.setTransform(dpr, 0, 0, dpr, 0, 0);
      mg.shadowColor = colors.text;
      mg.shadowBlur = (drift?.feather ?? 0) * dpr;
      for (const [x0, y0, x1, y1] of avoid) mg.fillRect(x0, y0, x1 - x0, y1 - y0);
      mg.shadowBlur = 0;
      mg.globalCompositeOperation = "source-over";
    }

    // The crowd as it shows now: the band at its scroll shift, again one width to its right so
    // the loop has no seam, then the mask. Painted only when the shift moves a whole device
    // pixel, about eight times a second, by copying, never by drawing the words again.
    function paintCrowd(at: number) {
      if (!cg) return;
      const px = Math.round(at * dpr);
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.globalCompositeOperation = "source-over";
      cg.clearRect(0, 0, crowdCanvas.width, crowdCanvas.height);
      cg.drawImage(tile, px, 0);
      if (scrolling) {
        cg.drawImage(tile, px + tile.width, 0);
        cg.globalCompositeOperation = "destination-in";
        cg.drawImage(mask, 0, 0);
        cg.globalCompositeOperation = "source-over";
      }
      paintedShift = px;
    }

    function newCycle() {
      if (!geo) return;
      plan = planCycle({
        runs,
        cycle: state.cycle,
        cell: geo.cell,
        x: geo.x,
        y: geo.y,
        width: heroWidth,
        height: geo.height,
        avoid,
        keepOut: stage ? [stage] : [],
      });
      walkBoxes = footprints(plan, geo.x, geo.y, geo.cell);
    }

    // ---------- your idea gathers a team ----------

    const currentShift = () =>
      scrolling && drift
        ? scrollOffset(state.driftClock, drift.cycle, drift.distance, drift.ease, heroWidth)
        : 0;
    const fits = (room: Rect, margin = 4, slack = 6) =>
      !!geo && roomFits(room, heroWidth, geo.height, avoid, margin, slack);
    const overBox = (p: Point) => zoneFade([p[0], p[1], p[0], p[1]], avoid, 0) <= 0;
    const overWalkers = (room: Rect) =>
      walkBoxes.some((q) => room[2] > q[0] && room[0] < q[2] && room[3] > q[1] && room[1] < q[3]);
    const nameSize = () => (geo ? crowdFontSize(geo.cell) * 1.18 : 0);
    const pen: Pen = {
      g: null as unknown as CanvasRenderingContext2D,
      colors,
      mono,
      width: 0,
      fontSize: 0,
      copy: copyRef.current,
      easeOut: (x) => x,
    };
    // the pen draws with the current theme, language and layout
    function readyPen(): Pen | null {
      if (!fg || !geo || !storyTokens) return null;
      pen.g = fg;
      pen.colors = colors;
      pen.mono = mono;
      pen.width = heroWidth;
      pen.fontSize = crowdFontSize(geo.cell);
      pen.copy = copyRef.current;
      pen.easeOut = storyTokens.out;
      return pen;
    }

    // a spot for the ghost's ring that nothing else claims: clear of the boxes with air to
    // spare, and of the walking names' paths
    const ghostFits = (c: Point) => fittingRadius(c, (room) => fits(room, 8, 8) && !overWalkers(room)) !== null;

    function gatherAt(centre: Point, from: Point | null): boolean {
      const p = readyPen();
      if (!p || !geo) return false;
      const ring = fittingRing(centre, (room) => fits(room));
      if (!ring) return false;
      const holders = pickTeam(words, ring.centre, currentShift(), heroWidth, scrolling, p.fontSize, avoid);
      if (!holders.length) return false;
      team = startTeam(holders, ring.centre, ring.radius, state.story, from, nameSize(), (text) =>
        measure(p, text, nameSize(), 500),
      );
      return true;
    }

    // one finished ring, the idea at rest in the middle of it: the story told in one frame
    function stillTeam() {
      team = null;
      ghost = null;
      if (!readyPen() || !geo) return;
      const spot = pickGhostSpot(rng(77), heroWidth, geo.height, null, ghostFits);
      if (!spot || !gatherAt(spot, null) || !team) return;
      const still: Team = team;
      placeMembers(still, still.members.map((m) => [m.homeX, m.homeY] as const), heroWidth, 1, 0);
      ghost = { ...newGhost(), x: spot[0], y: spot[1], alpha: 1, state: "rest" };
    }

    // puts the team where it is now: gathering, standing, or on its way home
    function moveTeam() {
      if (!team || !storyTokens) return;
      const shift = currentShift();
      const homes = team.members.map((m) => [wordX(m.word, shift, heroWidth, scrolling), m.word.y] as const);
      const gather = storyTokens.strong(Math.min(1, storyTime(team, state.story) / STORY.gather));
      const back = releaseProgress(team, state.story, storyTokens.modal, storyTokens.out);
      placeMembers(team, homes, heroWidth, gather, back);
      if (team.released !== null && back >= 1) {
        // home: the names are crowd words again
        team = null;
        state.tried = null;
      }
    }

    // one step of the story for `dt` seconds
    function tick(dt: number) {
      const p = state.pointer;
      state.idle += dt;
      state.rest = trackRest(state.rest, p, dt);
      const ghostOn = !p || (state.idle > IDLE_GHOST && !(team && !team.ghost));
      if (ghostOn) {
        // a pointer's team goes home when the ghost takes over; a ghost's own team goes on
        if (team && !team.ghost) releaseTeam(team, state.story);
        ghost ??= newGhost();
        stepGhost(ghost, dt, {
          rnd: rng(500 + ghostSpots * 31),
          width: heroWidth,
          height: geo?.height ?? 0,
          pick: (from) => {
            ghostSpots++;
            return pickGhostSpot(rng(500 + ghostSpots * 31), heroWidth, geo?.height ?? 0, from, ghostFits);
          },
          gather: () => gatherAt([ghost?.x ?? 0, ghost?.y ?? 0], null),
          team: team ? { released: team.released !== null } : null,
        });
        if (team?.ghost && shouldRelease(team, state.story, null, false)) releaseTeam(team, state.story);
      } else {
        if (ghost) {
          // the real pointer is back: the ghost fades, and lets its team go
          ghost.alpha = Math.max(0, ghost.alpha - dt * 4);
          if (team?.ghost) releaseTeam(team, state.story);
          if (ghost.alpha <= 0 && !team) ghost = null;
        }
        const rest = state.rest;
        if (!team && p && rest && isResting(rest) && state.tried !== rest.anchor && !overBox(p)) {
          state.tried = rest.anchor;
          const chip = readyPen() ? chipWidth(pen) : 0;
          gatherAt(chipCentre(p, chip, heroWidth), [p[0], p[1]]);
        }
        if (team && !team.ghost && shouldRelease(team, state.story, p, !!p && overBox(p))) {
          releaseTeam(team, state.story);
        }
      }
      moveTeam();
    }

    const inRoom = (point: Point, t: Team) => {
      const r = ringRoom(t.centre, t.radius);
      return point[0] > r[0] && point[0] < r[2] && point[1] > r[1] && point[1] < r[3];
    };

    // the effects layer: twin words, the team, the ghost's chip and the pointer's chip, which hangs
    // from the pointer's tip and hides over the two boxes (and over the finished ring when still)
    function paintEffects(shift: number, p: Pen) {
      if (!fg || !geo) return;
      fg.setTransform(dpr, 0, 0, dpr, 0, 0);
      fg.clearRect(0, 0, heroWidth, geo.height);
      const frozen = !moving;
      const pointer = fine ? state.pointer : null;
      // under the pointer, an English or French crowd word shows its twin in the other language
      if (pointer && !frozen && !overBox(pointer)) {
        const fontSize = crowdFontSize(geo.cell);
        fg.font = `${fontSize}px ${mono}`;
        fg.textBaseline = "top";
        for (const w of words) {
          const twin = TWIN[w.t];
          const x = wordX(w, shift, heroWidth, scrolling);
          if (!twin || Math.hypot(x + w.w / 2 - pointer[0], w.y - pointer[1]) > 64) continue;
          if (team?.members.some((m) => m.word === w)) continue;
          // a word that has faded out at the edge of the text or the square shows no twin
          if (zoneFade([x, w.y, x + w.w, w.y + fontSize], avoid, 0) <= 0) continue;
          fg.fillStyle = colors.bg;
          fg.fillRect(x - 1, w.y - 1, w.w + 2, fontSize + 3);
          fg.fillStyle = colors.muted;
          fg.fillText(twin, x, w.y);
        }
      }
      if (team) drawTeam(p, team, frozen ? 99 : storyTime(team, state.story), state.story, storyTokens?.modal ?? 0);
      // the ghost idea: a dashed chip centred on its spot
      if (ghost && ghost.alpha > 0 && ghost.x > 0) {
        drawChip(p, ghost.x - chipWidth(p) / 2, ghost.y, true, 0.85 * ghost.alpha);
      }
      // the real idea; while the hero is still, the names near it that hold the needed roles
      // are outlined with their roles, without any movement
      if (pointer && !overBox(pointer) && (frozen || !(ghost && ghost.alpha > 0.5))) {
        if (!(frozen && team && inRoom(pointer, team))) {
          if (frozen) drawSuggestions(p, suggestions);
          drawChip(p, chipLeft(pointer[0], chipWidth(p), heroWidth), pointer[1] + 15, false);
        }
      }
    }

    function draw(t: number) {
      if (!geo || !g || !plan || !treeEl || !canvasEl) return;
      const c = geo.cell;
      shift = currentShift();
      if (Math.round(shift * dpr) !== paintedShift) paintCrowd(shift);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvasEl.width, canvasEl.height);
      g.drawImage(crowdCanvas, 0, 0);

      // the effects are repainted only while there is something to show, then cleared once
      const effects = !!(team || ghost || (fine && state.pointer));
      const p = effects ? readyPen() : null;
      if (p) {
        paintEffects(shift, p);
        g.drawImage(fxLayer, 0, 0);
        fxDrawn = true;
      } else if (fxDrawn && fg) {
        fg.setTransform(1, 0, 0, 1, 0, 0);
        fg.clearRect(0, 0, fxLayer.width, fxLayer.height);
        fxDrawn = false;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const logo = state.still ? 1 : seg(t, plan.logoAt, FADE) * (1 - seg(t, plan.outAt, FADE));
      treeEl.style.opacity = logo.toFixed(3);
      if (state.still) return;

      g.font = `${nameFontSize(c)}px ${mono}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (const p of plan.pieces) {
        let pos: [number, number];
        let alpha: number;
        let colour: string;
        if (t < p.inStart) {
          // waiting in the crowd
          pos = [p.sx, p.sy];
          alpha = 0.9 * seg(t, 0, 0.4);
          colour = colors.lineStrong;
        } else if (t < plan.outAt) {
          // walking in, then standing in the V until the logo replaces the letters
          pos = at(p, Math.floor((t - p.inStart) / STEP));
          alpha = 1 - seg(t, plan.logoAt, FADE);
          colour = colors.text;
        } else if (t < p.outStart) {
          pos = [p.tx, p.ty];
          alpha = seg(t, plan.outAt, FADE);
          colour = colors.text;
        } else {
          // walking back out into the crowd
          const k = p.steps - Math.floor((t - p.outStart) / STEP);
          pos = at(p, Math.max(0, k));
          colour = k <= 0 ? colors.lineStrong : colors.text;
          alpha = (k <= 0 ? 0.9 : 1) * (1 - seg(t, plan.fadeAt, 0.4));
        }
        if (alpha <= 0.01) continue;
        g.globalAlpha = alpha;
        for (let i = 0; i < p.a.length; i++) {
          if (p.a[i] === " ") continue;
          const x = geo.x + (pos[0] + i) * c;
          const y = geo.y + pos[1] * c;
          g.fillStyle = colors.bg;
          g.fillRect(x, y, c, c);
          g.fillStyle = colour;
          g.fillText(p.a[i], x + c / 2, y + c / 2 + 0.5);
        }
      }
      g.globalAlpha = 1;
      g.textAlign = "left";
    }

    // if drawing ever fails, fall back to the still frame instead of a broken hero
    function fail() {
      animated = false;
      cancelAnimationFrame(raf);
      raf = 0;
      g?.setTransform(1, 0, 0, 1, 0, 0);
      g?.clearRect(0, 0, canvasEl?.width ?? 0, canvasEl?.height ?? 0);
      if (treeEl) treeEl.style.opacity = "1";
      showButton();
      markDrift();
      // the hero stays hidden until it is marked ready, so mark it, or it would stay blank
      heroEl?.setAttribute("data-ready", "");
    }

    // a clock that only runs while the loop is playing, visible and on screen
    function frame(now: number) {
      raf = 0;
      if (running()) {
        const step = state.last != null ? Math.min(100, now - state.last) / 1000 : 0;
        state.clock += step;
        state.story += step;
        state.driftClock += step;
        state.last = now;
        if (plan && state.clock >= plan.end) {
          state.clock = 0;
          state.cycle++;
          newCycle();
        }
        tick(step);
      } else {
        state.last = null;
      }
      markDrift();
      try {
        draw(state.clock);
      } catch {
        fail();
        return;
      }
      if (running()) raf = requestAnimationFrame(frame);
    }

    function invalidate() {
      if (!raf && geo && animated) raf = requestAnimationFrame(frame);
    }

    function relayout() {
      try {
        layout();
        state.clock = 0;
        state.last = null;
        draw(0);
      } catch {
        fail();
        return;
      }
      markDrift();
      invalidate();
    }

    function onPointerMove(e: PointerEvent) {
      if (!fine || !heroEl || (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen")) return;
      const r = heroEl.getBoundingClientRect();
      state.pointer = [e.clientX - r.left, e.clientY - r.top];
      state.idle = 0;
      // while the hero is still, the names near the pointer that hold the needed roles show
      if (!moving && geo) {
        suggestions = pickTeam(words, state.pointer, currentShift(), heroWidth, scrolling, crowdFontSize(geo.cell), avoid);
      }
      invalidate();
    }
    function onPointerLeave() {
      state.pointer = null;
      state.rest = null;
      suggestions = [];
      invalidate();
    }
    function onVisibility() {
      state.visible = !document.hidden;
      invalidate();
    }
    // Motion turned on after a still load needs the scrolling crowd and the walking names, so
    // lay the hero out again. Turned on after being turned off it carries on, turned off it
    // freezes where it is.
    function onMotion() {
      const next = motionOn();
      if (next === moving) return;
      moving = next;
      if (moving && state.still) relayout();
      else {
        // paused, the story stands as one finished ring; played again, it starts over
        team = null;
        ghost = null;
        state.rest = null;
        state.tried = null;
        if (!moving) stillTeam();
        markDrift();
        invalidate();
      }
    }
    function onTheme() {
      readTheme();
      paintTile();
      paintMask();
      paintedShift = Number.NaN;
      // The theme switch takes the new page's picture right after the change, before the next
      // frame: draw now, or the picture holds the old colours.
      if (geo && animated) {
        try {
          draw(state.clock);
        } catch {
          fail();
          return;
        }
      }
      invalidate();
    }
    // side by side the hero fills the window, so a change of window height matters too
    function onWindowResize() {
      if (window.innerHeight !== lastViewportHeight && geo && !geo.stacked) {
        relayout();
      }
    }

    heroEl.addEventListener("pointermove", onPointerMove);
    heroEl.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = subscribeMotion(onMotion);
    scheme.addEventListener("change", onTheme);
    window.addEventListener("resize", onWindowResize);
    const themeWatch = new MutationObserver(onTheme);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const resize = new ResizeObserver(() => {
      if (heroEl.clientWidth !== lastWidth) relayout();
    });
    resize.observe(heroEl);
    const onscreen =
      "IntersectionObserver" in window
        ? new IntersectionObserver((entries) => {
            state.onscreen = entries[0].isIntersecting;
            invalidate();
          })
        : null;
    onscreen?.observe(heroEl);

    // the web fonts change the height of the text, so place everything again once they load
    let active = true;
    document.fonts?.ready.then(() => {
      if (!active) return;
      try {
        layout();
      } catch {
        fail();
      }
      invalidate();
    });

    redraw.current = invalidate;
    readTheme();
    relayout();

    return () => {
      active = false;
      redraw.current = () => {};
      cancelAnimationFrame(raf);
      heroEl.removeEventListener("pointermove", onPointerMove);
      heroEl.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      scheme.removeEventListener("change", onTheme);
      window.removeEventListener("resize", onWindowResize);
      themeWatch.disconnect();
      resize.disconnect();
      onscreen?.disconnect();
    };
  }, []);

  return (
    <section ref={hero} className={styles.hero} aria-labelledby={labelledBy}>
      <div ref={copy} className={styles.copy}>
        {children}
      </div>
      <div ref={square} className={styles.square} aria-hidden="true" />
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div ref={tree} className={styles.tree} aria-hidden="true">
        <Logo size={32} className={styles.treeLogo} />
      </div>
      {/* WCAG 2.2.2: anything that moves for more than five seconds can be paused */}
      <button
        ref={play}
        type="button"
        className={`${styles.play} ${playing ? "" : styles.paused}`}
        onClick={() => setMotion(!playing)}
      >
        <svg className={styles.iconPause} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <rect x="3" y="2" width="3" height="10" fill="currentColor" />
          <rect x="8" y="2" width="3" height="10" fill="currentColor" />
        </svg>
        <svg className={styles.iconPlay} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <path d="M4 2L12 7L4 12Z" fill="currentColor" />
        </svg>
        {/* The visible words are the name (WCAG 2.5.3) and say what a press does. The other label
            sits unseen under them, so the button keeps one width when it flips and its place
            under the square never moves. No aria-pressed: the label itself changes. */}
        <span className={styles.label}>
          <span>{playing ? labels.pause : labels.play}</span>
          <span aria-hidden="true">{playing ? labels.play : labels.pause}</span>
        </span>
      </button>
    </section>
  );
}
