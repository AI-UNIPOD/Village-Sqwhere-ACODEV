"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { Tooltip } from "../tooltip";
import { parseEasing, parseSeconds } from "./gather";
import styles from "./landing-page.module.css";
import { THEME_KEY } from "./theme";
import { createTilePlan, tileColours, type TileColours, type TilePlan } from "./theme-tiles";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((tell) => tell());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  system.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    system.removeEventListener("change", onChange);
  };
}

function pageTheme(): Theme {
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "dark" || chosen === "light") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// the theme the visitor last asked for while a change is still running or queued, or null
let wanted: Theme | null = null;

// What the button shows: the last press at once, even while the page is still catching up.
function shownTheme(): Theme {
  return wanted ?? pageTheme();
}

function apply(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // private mode: the choice still applies until the page is closed
  }
  notify();
}

type ViewTransitionLike = { ready: Promise<void>; finished: Promise<void> };
type Transitioning = Document & { startViewTransition?: (update: () => void) => ViewTransitionLike };

// the wave takes one and a half --dur-moment (about 780 ms): slower than the other moments, so each
// tile's fold can be seen
const TILES_TIME = 1.5;
// how fast a running wave finishes when another press is waiting
const HURRY = 4;
// the highest pixel ratio the canvas draws at: sharper than that costs more than it shows
const MAX_RATIO = 2;

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function supports(property: string, value: string) {
  try {
    return typeof CSS !== "undefined" && CSS.supports(property, value);
  } catch {
    return false;
  }
}

// The change that is running, and what to do when another press comes in.
type Run = { hurry: () => void };
let running: Run | null = null;

// Only the last press counts. A press while a change runs is queued, never dropped: the running one
// speeds up, and if the last press differs from the theme the page then shows, the way back plays.
// Without view transitions (or, for the tiles, CSS linear() easings) the theme changes at once.
function press() {
  const doc = document as Transitioning;
  if (!doc.startViewTransition || (!reducedMotion() && !supports("animation-timing-function", "linear(0, 1)"))) {
    apply(pageTheme() === "dark" ? "light" : "dark");
    return;
  }
  const from = wanted ?? pageTheme();
  wanted = from === "dark" ? "light" : "dark";
  notify();
  if (running) {
    running.hurry();
    return;
  }
  next();
}

// Starts the change toward `wanted`, or ends the queue when the page already shows it.
function next() {
  if (running) return;
  if (wanted === null || wanted === pageTheme()) {
    wanted = null;
    notify();
    document.removeEventListener("click", catchRootClick);
    return;
  }
  document.addEventListener("click", catchRootClick);
  const done = () => {
    running = null;
    next();
  };
  running = reducedMotion() ? fade(wanted, done) : tiles(wanted, done);
}

// While a view transition runs, Chrome sends every mouse or touch press to the root element (the live
// page cannot be hit), so the button never sees a second click. Take the ones that land on a switch.
// Key presses reach the button as usual.
const buttons = new Set<HTMLButtonElement>();

function catchRootClick(event: MouseEvent) {
  if (event.target !== document.documentElement || !running) return;
  for (const button of buttons) {
    const box = button.getBoundingClientRect();
    if (
      box.width > 0 &&
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    ) {
      press();
      return;
    }
  }
}

// With reduced motion nothing travels: a short crossfade over --dur-modal, never an instant flip.
function fade(target: Theme, done: () => void): Run {
  const root = document.documentElement;
  root.setAttribute("data-theme-fade", "");
  const finish = () => {
    root.removeAttribute("data-theme-fade");
    done();
  };
  try {
    (document as Transitioning).startViewTransition!(() => apply(target)).finished.then(finish, finish);
  } catch {
    apply(target);
    void Promise.resolve().then(finish);
  }
  return { hurry: () => undefined };
}

// The new theme arrives in a wave of tiles from the centre of the screen. One view transition: the new
// page is revealed by a diamond (globals.css clips it to --tiles-s, which grows on the wave's own
// timing), and a canvas above it draws the tiles still folding outside the diamond, in the new colours.
function tiles(target: Theme, done: () => void): Run {
  const root = document.documentElement;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
  const style = getComputedStyle(root);
  const token = (name: string) => style.getPropertyValue(name).trim();
  // the built CSS writes 520ms as .52s, so read the unit, not just the number
  const duration = (parseSeconds(token("--dur-moment")) ?? 0.52) * 1000 * TILES_TIME;
  const narrow = width < 600;
  const instant = () => {
    apply(target);
    void Promise.resolve().then(done);
    return { hurry: () => undefined };
  };
  let plan: TilePlan;
  try {
    plan = createTilePlan({
      width,
      height,
      origin: { x: width / 2, y: height / 2 },
      pitch: parseFloat(token(narrow ? "--space-12" : "--space-20")) || (narrow ? 48 : 80),
      duration,
      strong: parseEasing(token("--ease-strong")),
      flipEase: parseEasing(token("--ease-out")),
    });
  } catch {
    return instant();
  }

  const state: {
    canvas: HTMLCanvasElement | null;
    ctx: CanvasRenderingContext2D | null;
    colours: TileColours | null;
    anim: Animation | null;
    frame: number;
    hurried: boolean;
    over: boolean;
  } = { canvas: null, ctx: null, colours: null, anim: null, frame: 0, hurried: false, over: false };

  root.setAttribute("data-theme-tiles", "");
  root.style.setProperty("--tiles-x", `${width / 2}px`);
  root.style.setProperty("--tiles-y", `${height / 2}px`);

  function paint() {
    state.frame = 0;
    if (state.over || !state.anim || !state.ctx || !state.colours) return;
    const progress = Number(state.anim.effect?.getComputedTiming().progress ?? 0);
    const clock = Math.min(duration, Math.max(0, Number(state.anim.currentTime) || 0));
    try {
      plan.draw(state.ctx, progress, clock, state.colours);
    } catch {
      // a frame that fails to draw is skipped; the diamond still reveals the page
    }
    state.frame = requestAnimationFrame(paint);
  }

  function cleanup() {
    state.over = true;
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.canvas?.remove();
    state.canvas = null;
    root.removeAttribute("data-theme-tiles");
    root.style.removeProperty("--tiles-x");
    root.style.removeProperty("--tiles-y");
  }

  const finish = () => {
    cleanup();
    done();
  };
  let transition: ViewTransitionLike;
  try {
    transition = (document as Transitioning).startViewTransition!(() => {
      apply(target);
      // the canvas joins the new state only, and its colours are read once the theme has changed
      const canvas = document.createElement("canvas");
      canvas.setAttribute("data-theme-tiles-canvas", "");
      canvas.setAttribute("aria-hidden", "true");
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      document.body.appendChild(canvas);
      state.canvas = canvas;
      state.ctx = canvas.getContext("2d");
      state.ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
      const after = getComputedStyle(root);
      state.colours = tileColours(
        after.getPropertyValue("--bg").trim(),
        after.getPropertyValue("--text").trim(),
        supports("color", "color-mix(in srgb, red, blue 10%)"),
      );
    });
  } catch {
    cleanup();
    return instant();
  }

  transition.ready
    .then(() => {
      // until now the closed clip in CSS hid the new theme; from here the diamond follows the wave
      state.anim = root.animate(
        { "--tiles-s": ["0px", `${plan.reach.toFixed(2)}px`] },
        { duration, easing: plan.easing, fill: "both", pseudoElement: "::view-transition-new(root)" },
      );
      if (state.hurried) state.anim.playbackRate = HURRY;
      paint();
    })
    .catch(() => undefined);
  transition.finished.then(finish, finish);

  return {
    hurry: () => {
      state.hurried = true;
      try {
        state.anim?.updatePlaybackRate(HURRY);
      } catch {
        // the wave just keeps its pace
      }
    },
  };
}

type ThemeToggleProps = { toDark: string; toLight: string };

// A moon on Paper (go dark) and a sun on Ink (go light), turning into each other.
function ThemeIcons() {
  return (
    <>
      <svg className={styles.moon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
      </svg>
      <svg
        className={styles.sun}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
    </>
  );
}

// The theme switch, an icon button in a header: the caller's class places and sizes it.
export function ThemeButton({ toDark, toLight, className }: ThemeToggleProps & { className: string }) {
  const theme = useSyncExternalStore(subscribe, shownTheme, () => "light" as Theme);
  const dark = theme === "dark";
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const own = button.current;
    if (!own) return;
    buttons.add(own);
    return () => {
      buttons.delete(own);
    };
  }, []);
  return (
    <button
      ref={button}
      type="button"
      className={`${className} ${styles.mode} ${dark ? styles.dark : ""}`}
      aria-label={dark ? toLight : toDark}
      onClick={press}
    >
      <ThemeIcons />
      <Tooltip label={dark ? toLight : toDark} side="left" />
    </button>
  );
}
