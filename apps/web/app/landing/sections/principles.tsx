"use client";

import { type CSSProperties, useEffect, useRef } from "react";

import type { Lang } from "../../locales";
import { HeadingText } from "../heading-text";
import styles from "../landing-page.module.css";
import { copy, type PrincipleKey } from "./principles-copy";
import own from "./principles.module.css";
import { reducesMotion } from "../../site-motion";

// Our own line icons on a 24px grid. Each path draws in once (pathLength 1).
const ICONS: Record<PrincipleKey, string[]> = {
  // four people in a ring
  together: [
    "M12 3.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z",
    "M20.5 9.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z",
    "M12 16a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z",
    "M3.5 9.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z",
  ],
  // a person and the pointer that chooses
  owner: [
    "M8.5 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    "M3 20.5c0-3.3 2.4-5.5 5.5-5.5 1.1 0 2.1.3 3 .8",
    "M14 9.5l7 3.2-3 1.2-1.2 3z",
  ],
  // a lock
  private: ["M5.5 11h13a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1Z", "M8 11V8a4 4 0 0 1 8 0v3", "M12 15v2.5"],
  // a tick in a shield
  verified: ["M12 3 5 5.8v5.4c0 4.4 2.9 7.7 7 9.3 4.1-1.6 7-4.9 7-9.3V5.8Z", "M8.8 12l2.4 2.4 4.2-4.6"],
};

export function Principles({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const listRef = useRef<HTMLDivElement>(null);

  // Icons that start below the screen wait with their lines undrawn, then draw once as they
  // scroll in. Without JavaScript, or with reduced motion, they are simply drawn.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !("IntersectionObserver" in window)) return;
    if (reducesMotion()) return;
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-draw]")).filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight,
    );
    if (items.length === 0) return;
    const draw = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-draw", "drawn");
          draw.unobserve(entry.target);
        }
      },
      { threshold: 0.3 },
    );
    for (const el of items) {
      el.setAttribute("data-draw", "waiting");
      draw.observe(el);
    }
    return () => draw.disconnect();
  }, []);

  return (
    <section className={`${styles.block} ${styles.warm}`} data-tile-bg="" aria-labelledby="principles-title">
      <div className={styles.wrap}>
        <h2 id="principles-title">
          <HeadingText text={t.title} />
        </h2>
        <div className={own.list} ref={listRef}>
          {t.items.map((item, i) => (
            <article
              className={`${own.item} ${styles.reveal}`}
              key={item.key}
              data-reveal=""
              data-draw=""
              style={{ "--i": i % 2 } as CSSProperties}
            >
              <svg className={own.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {ICONS[item.key].map((d) => (
                  <path key={d} d={d} pathLength={1} />
                ))}
              </svg>
              <h3 className={own.title}>{item.title}</h3>
              <p className={own.text}>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
