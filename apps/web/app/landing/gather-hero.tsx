"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { LOGO_PATHS, Logo } from "../logo";
import {
  FADE,
  STEP,
  TWIN,
  at,
  crowdFontSize,
  layoutCrowd,
  nameFontSize,
  parseEasing,
  parseSeconds,
  planCycle,
  pointerOnWord,
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
import { heroAvoid, heroGeometry, isPhoneWidth, type HeroGeometry } from "./hero-layout";

type GatherHeroProps = {
  /** The text block: headline, sentence and buttons. */
  children: ReactNode;
  labelledBy: string;
  /** Spoken labels of the pause button, in the page's language. */
  labels: { pause: string; play: string };
};

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
// visible and the visitor has not paused it or asked for reduced motion.
export function GatherHero({ children, labelledBy, labels }: GatherHeroProps) {
  const hero = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const play = useRef<HTMLButtonElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    pausedRef.current = paused;
    wake.current();
  }, [paused]);

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
    const runs = logoRuns();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    // Without a drawing surface the hero keeps its still frame: the square and the logo.
    let animated = !!g && !!cg;
    const state = {
      reduced: motion.matches,
      visible: !document.hidden,
      onscreen: true,
      clock: 0,
      last: null as number | null,
      pointer: null as [number, number] | null,
      cycle: 0,
      // the background drift has its own clock, so resting on a word holds only the drift
      driftClock: 0,
      held: false,
    };
    let geo: HeroGeometry | null = null;
    let heroWidth = 0;
    let avoid: readonly Rect[] = [];
    let words: CrowdWord[] = [];
    let plan: Cycle | null = null;
    let dpr = 1;
    let mono = "";
    let colors = { lineStrong: "", text: "", muted: "", bg: "" };
    let drift: { cycle: number; distance: number; feather: number; ease: (x: number) => number } | null =
      null;
    let shift = 0;
    let paintedShift = Number.NaN;
    // whether this layout scrolls: the tokens are there, motion is allowed, the browser can draw
    let scrolling = false;
    let raf = 0;
    let lastWidth = -1;
    let lastViewportHeight = -1;

    const running = () =>
      animated && !state.reduced && !pausedRef.current && state.visible && state.onscreen;

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
    }

    // what the drift is doing, for tests and debugging: on, held (pointer on a word) or off
    function markDrift() {
      const value =
        !animated || !scrolling || pausedRef.current ? "off" : state.held ? "held" : "on";
      if (heroEl && heroEl.getAttribute("data-drift") !== value) heroEl.setAttribute("data-drift", value);
    }

    function showButton() {
      if (playEl) playEl.style.display = animated && !state.reduced ? "grid" : "none";
    }

    function layout() {
      if (!heroEl || !copyEl || !squareEl || !canvasEl || !treeEl || !playEl) return;
      const width = heroEl.clientWidth;
      copyEl.classList.toggle(styles.center, isPhoneWidth(width));
      const hg = heroGeometry({
        width,
        viewportHeight: window.innerHeight,
        navHeight: document.querySelector<HTMLElement>("[data-site-header]")?.offsetHeight ?? 0,
        measureCopy: (left, copyWidth) => {
          copyEl.style.left = `${left}px`;
          copyEl.style.width = `${copyWidth}px`;
          copyEl.style.maxWidth = "none";
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
      showButton();
      heroEl.setAttribute("data-ready", "");
      lastWidth = width;
      lastViewportHeight = window.innerHeight;
      if (!animated) {
        treeEl.style.opacity = "1";
        return;
      }

      dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const surface of [canvasEl, crowdCanvas, tile, mask]) {
        surface.width = Math.round(width * dpr);
        surface.height = Math.round(hg.height * dpr);
      }
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${hg.height}px`;
      avoid = heroAvoid(hg);
      scrolling = !!drift && !state.reduced && !!tg && !!mg;
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
    }

    // the crowd's words, drawn once per layout or theme
    function paintTile() {
      if (!geo || !tg) return;
      tg.setTransform(dpr, 0, 0, dpr, 0, 0);
      tg.clearRect(0, 0, heroWidth, geo.height);
      tg.font = `${crowdFontSize(geo.cell)}px ${mono}`;
      tg.textBaseline = "top";
      tg.fillStyle = colors.lineStrong;
      tg.globalAlpha = 0.6;
      for (const w of words) tg.fillText(w.t, w.x, w.y);
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
      });
    }

    function draw(t: number) {
      if (!geo || !g || !plan || !treeEl || !canvasEl) return;
      const c = geo.cell;
      shift =
        scrolling && drift
          ? scrollOffset(state.driftClock, drift.cycle, drift.distance, drift.ease, heroWidth)
          : 0;
      if (Math.round(shift * dpr) !== paintedShift) paintCrowd(shift);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvasEl.width, canvasEl.height);
      g.drawImage(crowdCanvas, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // under the pointer, an English or French crowd word shows its twin in the other language
      const pointer = state.reduced ? null : state.pointer;
      if (pointer) {
        const fontSize = crowdFontSize(c);
        g.font = `${fontSize}px ${mono}`;
        g.textBaseline = "top";
        for (const w of words) {
          const twin = TWIN[w.t];
          // a word that has scrolled off the left edge is coming back in from the right
          const x = w.x + shift + (w.x + shift + w.w < 0 ? heroWidth : 0);
          if (!twin || Math.hypot(x + w.w / 2 - pointer[0], w.y - pointer[1]) > 64) continue;
          // a word that has faded out at the edge of the text or the square shows no twin
          if (zoneFade([x, w.y, x + w.w, w.y + fontSize], avoid, 0) <= 0) continue;
          g.fillStyle = colors.bg;
          g.fillRect(x - 1, w.y - 1, w.w + 2, fontSize + 3);
          g.fillStyle = colors.muted;
          g.fillText(twin, x, w.y);
        }
      }

      const logo = state.reduced ? 1 : seg(t, plan.logoAt, FADE) * (1 - seg(t, plan.outAt, FADE));
      treeEl.style.opacity = logo.toFixed(3);
      if (state.reduced) return;

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
        // resting the pointer on a word holds the drift; the walking names carry on
        if (!state.held) state.driftClock += step;
        state.last = now;
        if (plan && state.clock >= plan.end) {
          state.clock = 0;
          state.cycle++;
          newCycle();
        }
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
      if (state.reduced || !heroEl) return;
      const r = heroEl.getBoundingClientRect();
      state.pointer = [e.clientX - r.left, e.clientY - r.top];
      state.held =
        !!geo &&
        pointerOnWord(
          words,
          state.pointer[0],
          state.pointer[1],
          shift,
          crowdFontSize(geo.cell),
          avoid,
          scrolling ? heroWidth : 0,
        );
      markDrift();
      invalidate();
    }
    function onPointerLeave() {
      state.pointer = null;
      state.held = false;
      markDrift();
      invalidate();
    }
    function onVisibility() {
      state.visible = !document.hidden;
      invalidate();
    }
    function onMotion() {
      state.reduced = motion.matches;
      showButton();
      relayout();
    }
    function onTheme() {
      readTheme();
      paintTile();
      paintMask();
      paintedShift = Number.NaN;
      invalidate();
    }
    // on wide screens the hero fills the window, so a change of window height matters too
    function onWindowResize() {
      if (window.innerHeight !== lastViewportHeight && heroEl && heroEl.clientWidth >= 1200) {
        relayout();
      }
    }

    heroEl.addEventListener("pointermove", onPointerMove);
    heroEl.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
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

    readTheme();
    // the pause button: update what the drift is doing at once, then draw
    wake.current = () => {
      markDrift();
      invalidate();
    };
    relayout();

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      wake.current = () => {};
      heroEl.removeEventListener("pointermove", onPointerMove);
      heroEl.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
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
        className={`${styles.play} ${paused ? styles.paused : ""}`}
        aria-label={paused ? labels.play : labels.pause}
        onClick={() => setPaused((p) => !p)}
      >
        <svg className={styles.iconPause} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <rect x="3" y="2" width="3" height="10" fill="currentColor" />
          <rect x="8" y="2" width="3" height="10" fill="currentColor" />
        </svg>
        <svg className={styles.iconPlay} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <path d="M4 2L12 7L4 12Z" fill="currentColor" />
        </svg>
      </button>
    </section>
  );
}
