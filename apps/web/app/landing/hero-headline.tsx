"use client";

import { useLayoutEffect, useRef } from "react";

import { createEdit, type Edit } from "./headline-edit";
import styles from "./hero-headline.module.css";
import type { HeadlineEdit } from "./hero-headline-copy";
import { motionOn, subscribeMotion } from "./motion";
import { isPhone } from "./phone";

type HeroHeadlineProps = {
  id: string;
  /** The finished headline: what the page says, what is read out and what is indexed. */
  headline: string;
  edit: HeadlineEdit;
};

const FONT_WAIT = 1500; // ms to wait for the display font before giving up on the animation

// The hero's h1. The real headline is always in the page, in the flow, and is the heading's
// name; it is also all there is without JavaScript, with reduced motion, with the motion
// button off, and when anything fails. When motion is on and the hero shows, a layer over it
// (aria-hidden) plays the headline being edited into shape by three people, once, and ends on
// the real text. The real text keeps its place the whole time, so the hero's measuring and the
// square never see a different height. See headline-edit.ts for the beats.
export function HeroHeadline({ id, headline, edit }: HeroHeadlineProps) {
  const h1 = useRef<HTMLHeadingElement>(null);
  const real = useRef<HTMLSpanElement>(null);
  const stage = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const h1El = h1.current;
    const realEl = real.current;
    const stageEl = stage.current;
    if (!h1El || !realEl || !stageEl) return;
    // A phone has no motion button to stop it, and the edit runs past five seconds (WCAG 2.2.2),
    // so a phone shows the finished headline only.
    if (isPhone()) return;

    // idle: nothing placed yet. ready: the layer shows the draft, waiting for the hero to be
    // seen. running: the beats are playing. done: played once (or not possible): leave it be.
    let phase: "idle" | "ready" | "running" | "done" = "idle";
    let current: Edit | null = null;
    let alive = true;
    let waiting = false;
    let raf = 0;
    let fontTimer: ReturnType<typeof setTimeout> | undefined;
    let onscreen = typeof IntersectionObserver === "undefined";
    let size = "";

    const sizeNow = () => `${h1El.offsetWidth}x${h1El.offsetHeight}`;

    // back to the plain headline
    function still() {
      current?.stop();
      current = null;
      stageEl?.replaceChildren();
      h1El?.removeAttribute("data-headline");
    }

    function tryRun() {
      if (phase !== "ready" || !current || !onscreen || document.hidden || !motionOn()) return;
      phase = "running";
      const playing = current;
      void playing.run().then(() => {
        if (!alive || current !== playing) return;
        still();
        phase = "done";
      });
    }

    // Measure the finished headline and put the draft layer over it. This runs a frame after
    // the hero has placed its text, so the lines are the ones that stay.
    function prepare() {
      raf = 0;
      waiting = false;
      if (!alive || phase !== "idle" || !motionOn()) return;
      try {
        current = createEdit(h1El!, realEl!, stageEl!, headline, edit);
      } catch {
        current = null;
      }
      if (!current) {
        phase = "done";
        return;
      }
      size = sizeNow();
      h1El!.setAttribute("data-headline", "playing");
      phase = "ready";
      tryRun();
    }

    // wait for the display font, so the lines are measured in it
    function schedule() {
      if (phase !== "idle" || waiting || !motionOn()) return;
      waiting = true;
      const go = () => {
        clearTimeout(fontTimer);
        if (alive) raf = requestAnimationFrame(prepare);
      };
      const fonts = document.fonts;
      const font = getComputedStyle(h1El!).font;
      let loaded = true;
      try {
        loaded = !fonts || fonts.check(font, headline);
      } catch {
        // an unreadable font setting: measure now
      }
      if (loaded) return go();
      fontTimer = setTimeout(() => {
        waiting = false;
        phase = "done";
      }, FONT_WAIT);
      void fonts.load(font, headline).then(go, go);
    }

    function onMotion() {
      if (motionOn()) {
        if (phase === "idle") schedule();
        else tryRun();
      } else if (phase === "ready" || phase === "running") {
        // pausing stops the show at the finished headline; a hero that had not started can still play
        still();
        phase = phase === "ready" ? "idle" : "done";
      }
    }

    const seen =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              onscreen = entries[entries.length - 1].isIntersecting;
              tryRun();
            },
            { threshold: 0.5 },
          );
    seen?.observe(h1El);

    // a change of size (a window resize, the hero placing its text again) breaks the lines the
    // layer was measured on: before it started, measure again; once it plays, finish still
    size = sizeNow();
    const resized =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (sizeNow() === size) return;
            size = sizeNow();
            if (phase === "ready") {
              still();
              phase = "idle";
              schedule();
            } else if (phase === "running") {
              still();
              phase = "done";
            }
          });
    resized?.observe(h1El);

    const unsubscribe = subscribeMotion(onMotion);
    document.addEventListener("visibilitychange", tryRun);
    schedule();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(fontTimer);
      seen?.disconnect();
      resized?.disconnect();
      unsubscribe();
      document.removeEventListener("visibilitychange", tryRun);
      still();
    };
  }, [headline, edit]);

  // the underlined words get their own element, so the finished headline carries the underline
  // without JavaScript
  const at = headline.indexOf(edit.underline);
  const parts =
    at < 0
      ? ([headline, "", ""] as const)
      : ([headline.slice(0, at), edit.underline, headline.slice(at + edit.underline.length)] as const);

  return (
    <h1 id={id} ref={h1} className={styles.headline}>
      <span ref={real} className={styles.real}>
        {parts[0]}
        <span className={styles.mark} data-mark="">
          {parts[1]}
        </span>
        {parts[2]}
      </span>
      <span ref={stage} className={styles.stage} aria-hidden="true" />
    </h1>
  );
}
