"use client";

import { useState, type CSSProperties } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { LOGO_PATHS } from "../logo";
import { copy } from "./copy";
import styles from "./not-found-page.module.css";

// Where each person stands once gathered, on the logo's own 32 by 32 grid: three rows across
// the canopy, then down the two arms of the V to its foot.
const HOME: ReadonlyArray<readonly [number, number]> = [
  [5, 12], [8, 12], [11, 12], [14, 12], [18, 12], [21, 12], [24, 12], [27, 12],
  [7.5, 9], [11, 9], [14.5, 9], [17.5, 9], [21, 9], [24.5, 9],
  [12.5, 6.5], [16, 6.2], [19.5, 6.5],
  [9.6, 15.5], [11.2, 19], [12.8, 22.4], [14.4, 25.8],
  [22.4, 15.5], [20.8, 19], [19.2, 22.4], [17.6, 25.8],
  [16, 28.6],
];

const round = (n: number) => Math.round(n * 10) / 10;

// Where they wander, around the tree. A fixed spread (each a golden angle from the
// last), so the server and the browser draw the same picture.
const PEOPLE = HOME.map(([tx, ty], i) => {
  const angle = i * 2.39996;
  const reach = 15 + ((i * 7) % 11);
  return {
    "--sx": round(16 + Math.cos(angle) * reach * 1.3),
    "--sy": round(16 + Math.sin(angle) * reach * 0.95),
    "--tx": tx,
    "--ty": ty,
    "--i": i,
    // how far and how slowly each one drifts while waiting
    "--dx": ((i * 5) % 7) * 0.5 - 1.5,
    "--dy": ((i * 3) % 5) * 0.6 - 1.2,
    "--pace": 1 + (i % 4) * 0.3,
  } as CSSProperties;
});

// The scene beside the message. This is a page nobody is at, so the people who would gather
// under the palaver tree are wandering around where it will stand. The button calls them back: they
// walk in, and the tree is whole. It changes nothing about the page being missing, and says so.
export function Gathering({ lang }: { lang: Lang }) {
  const t = copy[lang].stage;
  const [gathered, setGathered] = useState(false);
  return (
    <div className={styles.stage} data-gathered={gathered || undefined}>
      <svg className={styles.scene} viewBox="-20 -10 72 52" aria-hidden="true" focusable="false">
        <g className={styles.tree}>
          {LOGO_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        {PEOPLE.map((place, i) => (
          <g key={i} className={styles.person} style={place}>
            <circle className={styles.body} r="0.9" />
          </g>
        ))}
      </svg>
      {/* a status, so a screen reader hears what the button did */}
      <p className={styles.caption} role="status">
        {gathered ? t.gathered : t.missing}
      </p>
      <button type="button" className={landing.ghost} onClick={() => setGathered((now) => !now)}>
        {gathered ? t.scatter : t.gather}
      </button>
    </div>
  );
}
