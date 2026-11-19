"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { Lang } from "../../locales";
import { HeadingText } from "../heading-text";
import styles from "../landing-page.module.css";
import { copy } from "./green-tick-copy";
import own from "./green-tick.module.css";
import { reducesMotion } from "../../site-motion";

// One row advances every STEP_MS. Stage 0 is the start, 1 to 3 finish a row each, 4 stamps the
// seal and 5 shows the win. The finished page is stage 5, so the server render, a browser
// without JavaScript or IntersectionObserver, and reduced motion all show it.
const STAGES = [600, 1200, 1800, 2400, 3300];
const FINISHED = STAGES.length;
const SEALED = 4;

type PillState = "checking" | "yourTurn" | "waiting" | "done";

function rowStates(stage: number): [PillState, PillState, PillState] {
  return [
    stage >= 1 ? "done" : "checking",
    stage >= 2 ? "done" : stage === 1 ? "yourTurn" : "waiting",
    stage >= 3 ? "done" : "waiting",
  ];
}

// Every status pill carries an icon and a word: colour never says it alone.
const ICONS: Record<PillState, string[]> = {
  checking: ["M8 2.5a5.5 5.5 0 1 0 5.5 5.5"],
  yourTurn: ["M3 8h9", "M8.5 4.5 12 8l-3.5 3.5"],
  waiting: ["M8 5v3l2 1.2"],
  done: ["M3.5 8.5l3 3 6-6.5"],
};

function Pill({ state, label }: { state: PillState; label: string }) {
  return (
    <span className={own.pill} data-state={state}>
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        {state === "waiting" && <circle cx="8" cy="8" r="5.5" />}
        {ICONS[state].map((d) => (
          <path key={d} d={d} pathLength={1} />
        ))}
      </svg>
      {label}
    </span>
  );
}

export function GreenTick({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [stage, setStage] = useState(FINISHED);
  // false on the server and while hydrating, true after: the button does nothing without script
  const canReplay = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const cardRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);

  const play = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    setStage(0);
    timers.current = STAGES.map((ms, i) => window.setTimeout(() => setStage(i + 1), ms));
  }, []);

  useEffect(() => {
    const card = cardRef.current;
    const timerIds = timers.current;
    const reduced = reducesMotion();
    if (reduced || !card || !("IntersectionObserver" in window)) return;

    // Back to the start only now that the script runs, so the page is complete without it.
    setStage(0);
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watch.disconnect();
        play();
      },
      { threshold: 0.4 },
    );
    watch.observe(card);
    return () => {
      watch.disconnect();
      timerIds.forEach((id) => window.clearTimeout(id));
    };
  }, [play]);

  const running = stage < FINISHED;
  const states = rowStates(stage);
  const won = stage >= FINISHED;

  return (
    <section className={styles.block} id="green-tick" aria-labelledby="green-tick-title">
      <div className={styles.wrap}>
        <h2 id="green-tick-title">
          <HeadingText text={t.title} />
        </h2>
        <p className={styles.lead}>{t.lead}</p>

        <div className={own.body}>
          <div className={styles.reveal} data-reveal="" style={{ "--i": 0 } as CSSProperties}>
            <ol className={own.steps} role="list" aria-label={t.stepsLabel}>
              {t.steps.map((step, i) => (
                <li className={own.step} key={step.title}>
                  <span className={own.num} aria-hidden="true">
                    {`0${i + 1}`}
                  </span>
                  <div>
                    <h3 className={own.stepTitle}>{step.title}</h3>
                    <p className={own.stepText}>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className={own.attempts}>{t.attempts}</p>
            <p className={own.noTick}>{t.noTickNeeded}</p>
          </div>

          <div className={`${own.stage} ${styles.reveal}`} data-reveal="" style={{ "--i": 1 } as CSSProperties}>
            <figure className={own.figure}>
              <div className={own.card} ref={cardRef}>
                <div className={own.head}>
                  <span className={own.avatar} aria-hidden="true">
                    {t.demo.initials}
                  </span>
                  <div className={own.who}>
                    <p className={own.name}>{t.demo.name}</p>
                    <p className={own.role}>{t.demo.role}</p>
                  </div>
                  <span className={own.seal} aria-hidden="true">
                    <svg viewBox="0 0 64 64" focusable="false">
                      <circle className={own.track} cx="32" cy="32" r="28" />
                    </svg>
                    <span className={own.stamp} data-on={stage >= SEALED ? "" : undefined}>
                      <svg viewBox="0 0 64 64" focusable="false">
                        <circle className={own.tint} cx="32" cy="32" r="28" />
                        <circle className={own.arc} cx="32" cy="32" r="28" pathLength={1} transform="rotate(-90 32 32)" />
                        <path className={own.tick} d="M21 33.5l8 8 15-17" pathLength={1} />
                      </svg>
                    </span>
                  </span>
                </div>

                <ul className={own.rows}>
                  {t.steps.map((step, i) => (
                    <li className={own.row} key={step.title}>
                      <span className={own.rowTitle}>{step.title}</span>
                      <Pill key={states[i]} state={states[i]} label={t.demo.pill[states[i]]} />
                    </li>
                  ))}
                </ul>

                {/* The finished sentence sizes the box so nothing jumps when it appears; the
                    live region says it once the tick is stamped. */}
                <div className={own.win} data-won={won ? "" : undefined}>
                  <p className={own.winSizer} aria-hidden="true">
                    {t.win}
                  </p>
                  <p className={own.winText} aria-live="polite">
                    {won && <span className={own.winIn}>{t.win}</span>}
                  </p>
                </div>
              </div>

              <figcaption className={own.caption}>
                <span>{t.demo.caption}</span>
                <button
                  type="button"
                  className={`${styles.ghost} ${own.replay}`}
                  hidden={!canReplay}
                  aria-disabled={running || undefined}
                  onClick={() => {
                    if (!running) play();
                  }}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
                    <path d="M2.5 8a5.5 5.5 0 1 0 1.8-4.1" />
                    <path d="M2.5 2.5v3.2h3.2" />
                  </svg>
                  {t.demo.replay}
                </button>
              </figcaption>
            </figure>
          </div>
        </div>
      </div>
    </section>
  );
}
