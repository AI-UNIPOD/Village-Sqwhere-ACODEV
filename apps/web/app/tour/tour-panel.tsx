"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { scrollToPart } from "../scroll";
import { signOut } from "../session/session";
import { copy } from "./copy";
import styles from "./tour.module.css";
import { STOPS, arrived, chooseStop, endTour, keepRoute, loadRoute, stopAddress, stopPath, useTour } from "./tour";

// The guided tour's bar, stuck under the demo line while the page scrolls. On the stop it
// shows the stop; on any other screen, where the person has wandered off, it shrinks to a line
// that leads back. `path` is the frame's address of the screen it sits in.
export function TourPanel({ lang, path }: { lang: Lang; path: string }) {
  const t = copy[lang];
  const router = useRouter();
  const { tour, arriving } = useTour();
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
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

  const onStop = tour !== null && path === stopPath(tour.step, tour.route);
  // a stop was just chosen on this screen or the one before it: the screen that is on its way
  // takes focus, so a keyboard or screen reader user hears the stop. A plain load does not.
  useEffect(() => {
    if (!arriving || !onStop) return;
    heading.current?.focus();
    arrived();
  }, [arriving, onStop]);

  if (!tour) return null;
  const { step, route } = tour;
  const name = t.stops[step].name;
  const count = step > 0 ? fill(t.count, { n: step, total: STOPS }) : null;

  function go(to: number) {
    const address = stopAddress(to, route);
    const sameScreen = stopPath(to, route) === path;
    chooseStop(to);
    // the same screen with another part to show: the router's own scroll would put the part
    // at the very top, under this bar, so the scroll is done here
    router.push(`/${lang}/${address}`, sameScreen ? { scroll: false } : undefined);
    const [, part] = address.split("#");
    if (sameScreen && part && panel.current) scrollToPart(panel.current, part);
  }

  if (!onStop && !arriving) {
    return (
      <section className={styles.panel} aria-label={t.label} data-compact="" data-sticks-top="">
        <p className={styles.line}>
          {count && <span className={styles.count}>{count}</span>}
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

  const last = step === STOPS;
  return (
    <section ref={panel} className={styles.panel} aria-label={t.label} data-sticks-top="">
      {/* a new stop is a new block, so the words arrive again */}
      <div key={step}>
        {count && <p className={styles.count}>{count}</p>}
        <h2 className={styles.name} ref={heading} tabIndex={-1}>
          {name}
        </h2>
        <p className={styles.text}>{t.stops[step].text}</p>
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
        {Array.from({ length: STOPS }, (_, part) => (
          <span key={part} className={styles.part} data-filled={part < step || undefined} data-current={part === step - 1 || undefined} />
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
