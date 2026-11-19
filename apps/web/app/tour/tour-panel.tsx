"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { signOut } from "../session/session";
import { copy } from "./copy";
import styles from "./tour.module.css";
import { STEPS, arrived, chooseStep, endTour, keepRoute, loadRoute, stepAddress, stepPath, useTour } from "./tour";

// The guided tour's bar, stuck under the demo line while the page scrolls. On the step's screen it
// shows the step; on any other screen, where the person has wandered off, it shrinks to a line
// that leads back. `path` is the frame's address of the screen it sits in.
export function TourPanel({ lang, path }: { lang: Lang; path: string }) {
  const t = copy[lang];
  const router = useRouter();
  const { tour, arriving } = useTour();
  const heading = useRef<HTMLHeadingElement>(null);
  // the idea and hub are asked for once, when the tour starts; a failure belongs to one try
  const [attempt, setAttempt] = useState(0);
  const [failedAttempt, setFailedAttempt] = useState<number | null>(null);

  const needsRoute = tour !== null && tour.route === null;
  useEffect(() => {
    if (!needsRoute) return;
    let live = true;
    loadRoute().then(
      (route) => {
        if (!live) return;
        if (route) keepRoute(route);
        else setFailedAttempt(attempt);
      },
      () => live && setFailedAttempt(attempt),
    );
    return () => {
      live = false;
    };
  }, [needsRoute, attempt]);

  // the feed narrowed to a kind or a topic is still the feed: its step invites just that
  const shown = path.startsWith("feed?") ? "feed" : path;
  const onStep = tour !== null && shown === stepPath(tour.step, tour.route);
  // a step was just chosen on this screen or the one before it: the screen that is on its way
  // takes focus, so a keyboard or screen reader user hears the step. A plain load does not.
  useEffect(() => {
    if (!arriving || !onStep) return;
    heading.current?.focus();
    arrived();
  }, [arriving, onStep]);

  if (!tour) return null;
  const { step, route } = tour;
  const name = t.steps[step].name;
  const count = fill(t.count, { n: step + 1, total: STEPS });

  function go(to: number) {
    chooseStep(to);
    router.push(`/${lang}/${stepAddress(to, route)}`);
  }

  if (!onStep && !arriving) {
    return (
      <section className={styles.panel} aria-label={t.label} data-compact="" data-sticks-top="">
        <p className={styles.line}>
          <span className={styles.count}>{count}</span>
          <span className={styles.name}>{name}</span>
        </p>
        <div className={styles.buttons}>
          <button type="button" className={landing.ghost} onClick={() => go(step)}>
            {t.backToRoute}
          </button>
          <button type="button" className={landing.navLink} onClick={endTour}>
            {t.end}
          </button>
        </div>
      </section>
    );
  }

  if (!route && failedAttempt === attempt) {
    return (
      <section className={styles.panel} aria-label={t.label} data-sticks-top="">
        <p className={styles.text} role="alert">
          {t.failed.text}
        </p>
        <div className={styles.buttons}>
          <button type="button" className={landing.ghost} onClick={() => setAttempt(attempt + 1)}>
            {t.failed.retry}
          </button>
          <button type="button" className={landing.navLink} onClick={endTour}>
            {t.end}
          </button>
        </div>
      </section>
    );
  }

  const last = step === STEPS - 1;
  return (
    <section className={styles.panel} aria-label={t.label} data-sticks-top="">
      {/* a new step is a new block, so the words arrive again */}
      <div key={step}>
        <p className={styles.count}>{count}</p>
        <h2 className={styles.name} ref={heading} tabIndex={-1}>
          {name}
        </h2>
        <p className={styles.text}>{t.steps[step].text}</p>
        {last && (
          <p className={styles.text}>
            {t.ending.before}
            {/* the demo session would send sign-in straight back to the village, so it ends first */}
            <a
              className={styles.link}
              href={`/${lang}/sign-in`}
              onClick={(event) => {
                event.preventDefault();
                signOut(lang, "/sign-in");
              }}
            >
              {t.ending.link}
            </a>
            {t.ending.after}
          </p>
        )}
      </div>
      <div className={styles.progress} aria-hidden="true">
        {Array.from({ length: STEPS }, (_, part) => (
          <span key={part} className={styles.part} data-filled={part <= step || undefined} data-current={part === step || undefined} />
        ))}
      </div>
      <div className={styles.buttons}>
        {step > 0 && (
          <button type="button" className={landing.ghost} onClick={() => go(step - 1)}>
            {t.back}
          </button>
        )}
        <button
          type="button"
          className={landing.ghost}
          aria-disabled={!route || undefined}
          aria-busy={!route || undefined}
          onClick={() => {
            if (last) endTour();
            else if (route) go(step + 1);
          }}
        >
          {step === 0 ? t.start : last ? t.finish : t.next}
        </button>
        <button type="button" className={landing.navLink} onClick={endTour}>
          {t.end}
        </button>
      </div>
    </section>
  );
}
