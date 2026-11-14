"use client";

import { useEffect, useState, type ComponentType } from "react";

import { cubicBezier, parseEasing, parseSeconds } from "../landing/gather";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, TriangleAlert } from "../onboarding/icons";
import { sectorName, technologyName } from "./browse";
import { copy } from "./copy";
import type { Scored } from "./ideas-api";
import styles from "./match-score.module.css";

type Step = "strong" | "possible" | "weak" | "poor";

// The steps of docs/design-system/components.md, "Match score".
const stepOf = (score: number): Step => (score >= 80 ? "strong" : score >= 60 ? "possible" : score >= 40 ? "weak" : "poor");

const icons: Record<Step, ComponentType | null> = { strong: Check, possible: null, weak: TriangleAlert, poor: AlertCircle };

// `--ease-strong`, for when the token cannot be read
const strong = cubicBezier([0.16, 1, 0.3, 1]);

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// "Backend Engineer and Systems Engineer": names as a sentence reads them in the page's language.
export const sentenceList = (lang: Lang, names: string[]) => new Intl.ListFormat(lang, { type: "conjunction" }).format(names);

// The number and its step as a pill under it. When the list arrives the number counts up once
// (a strong one swells a little at the end); with reduced motion it shows at once. A screen
// reader hears one sentence, never the count. `count={false}` shows the number at once and reads
// nothing from the browser, for a card drawn on the server (the landing's matcher demo).
export function MatchScore({ lang, score, partial, count = true }: { lang: Lang; score: number; partial: boolean; count?: boolean }) {
  const t = copy[lang].score;
  // decided when the card first shows: a card that re-renders, or follows fresh data, does not count again
  const [counting] = useState(() => count && !still());
  const [playing, setPlaying] = useState(counting);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const root = getComputedStyle(document.documentElement);
    const ms = (parseSeconds(root.getPropertyValue("--dur-moment")) ?? 0.52) * 1000;
    // the Motion table's easing for a match landing, read from the token
    const ease = parseEasing(root.getPropertyValue("--ease-strong")) ?? strong;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const done = Math.min(1, (now - start) / ms);
      setShown(Math.round(score * ease(done)));
      if (done < 1) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, score]);

  const step = stepOf(score);
  const Icon = icons[step];
  const heard = [fill(t.heard[step], { score }), partial && t.heardPartial].filter(Boolean).join(" ");
  return (
    <p className={styles.score} data-step={step}>
      <span className={landing.srOnly}>{heard}</span>
      <span className={styles.value} data-swell={(counting && step === "strong") || undefined} aria-hidden="true">
        {playing ? shown : score}
      </span>
      <span className={styles.pill} aria-hidden="true">
        {Icon && <Icon />}
        {t.steps[step]}
      </span>
    </p>
  );
}

// What earned the points, part by part, with the raw points of each. `roles`, `technologies`
// and `sectors` are the screen's own sentences; the last two say the names they are given. An API that sends no breakdown still gets its reasons, just without points.
export function ScoreReasons({
  lang,
  scored,
  roles,
  technologies,
  sectors,
}: {
  lang: Lang;
  scored: Scored & { shared_technologies: { slug: string; name: string }[] };
  roles: string;
  technologies: (names: string) => string;
  sectors: (names: string) => string;
}) {
  const t = copy[lang].score;
  const { breakdown, shared_technologies: sharedTech, shared_sectors: sharedSectors } = scored;
  const points = (part: keyof NonNullable<typeof breakdown>) => {
    const one = breakdown?.[part];
    return one && one.points !== null ? fill(t.points, { points: one.points, max: one.max }) : null;
  };
  const rows = [
    { part: "roles" as const, text: roles },
    { part: "technologies" as const, text: sharedTech.length > 0 ? technologies(sharedTech.map((tech) => technologyName(lang, tech)).join(", ")) : t.noTechnologies },
    // an older API sends no sectors: saying "none" would be a guess
    ...(sharedSectors
      ? [{ part: "sectors" as const, text: sharedSectors.length > 0 ? sectors(sentenceList(lang, sharedSectors.map((sector) => sectorName(lang, sector)))) : t.noSectors }]
      : []),
    ...(breakdown ? [{ part: "meaning" as const, text: t.notCompared }] : []),
  ];
  return (
    <>
      <ul className={styles.reasons} role="list" aria-label={t.why}>
        {rows.map(({ part, text }) => (
          <li key={part} className={styles.reason}>
            <span className={styles.part}>{t.parts[part]}</span>
            {points(part) && <span className={styles.points}>{points(part)}</span>}
            <span className={styles.detail}>{text}</span>
          </li>
        ))}
      </ul>
      {scored.partial && <p className={styles.quiet}>{t.partial}</p>}
    </>
  );
}
