"use client";

import { type CSSProperties, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import type { Lang } from "../../locales";
import { HeadingText } from "../heading-text";
import styles from "../landing-page.module.css";
import { COMMITS, copy, NOTE_AUTHORS, type Copy } from "./hub-phases-copy";
import s from "./hub-phases.module.css";

// How much of the demo shows before the first phase plays its entrance.
const ENTRANCE_THRESHOLD = 0.3;

// the position of an item in its view's entrance, read by the stylesheet as the stagger
const at = (i: number) => ({ "--i": i }) as CSSProperties;

function Avatar({ initials }: { initials: string }) {
  return (
    <span className={s.avatar} aria-hidden="true">
      {initials}
    </span>
  );
}

function NotesView({ items }: { items: NonNullable<Copy["phases"][0]["items"]> }) {
  return (
    <ul className={s.notes}>
      {items.map((text, i) => (
        <li key={text} className={`${s.note} ${s.item}`} data-note={i} style={at(i)}>
          <Avatar initials={NOTE_AUTHORS[i]} />
          <p>{text}</p>
        </li>
      ))}
    </ul>
  );
}

// A connector is a fixed-size drawing, so its stroke never stretches with the boxes around it.
function Link({ i }: { i: number }) {
  return (
    <svg className={`${s.link} ${s.item}`} style={at(i)} viewBox="0 0 40 16" aria-hidden="true">
      <path className={s.draw} pathLength={1} d="M0 8H38M32 3l6 5-6 5" />
    </svg>
  );
}

function ArchView({ items }: { items: NonNullable<Copy["phases"][1]["items"]> }) {
  return (
    <ul className={s.arch}>
      {items.map((label, i) => (
        <li key={label} className={s.archStep}>
          <span className={`${s.box} ${s.item}`} style={at(i * 2)}>
            {label}
          </span>
          {i < items.length - 1 && <Link i={i * 2 + 1} />}
        </li>
      ))}
    </ul>
  );
}

function CommitsView() {
  return (
    <ul className={s.log}>
      {COMMITS.map(({ initials, hash, message }, i) => (
        <li key={message} className={`${s.commit} ${s.item}`} style={at(i)}>
          <Avatar initials={initials} />
          <span className={s.message}>{message}</span>
          <span className={s.hash}>{hash}</span>
        </li>
      ))}
    </ul>
  );
}

function ChecksView({ items, done }: { items: NonNullable<Copy["phases"][3]["items"]>; done: string }) {
  return (
    <ul className={s.checks}>
      {items.map((label, i) => (
        <li
          key={label}
          className={`${s.checkRow} ${s.item}`}
          data-last={i === items.length - 1 ? "" : undefined}
          style={at(i)}
        >
          <span className={s.tickBox} aria-hidden="true">
            <span className={`${s.tickFill} ${s.fill}`} />
            <svg viewBox="0 0 24 24">
              <path className={s.draw} pathLength={1} d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span>{label}</span>
          <span className={styles.srOnly}>{done}</span>
        </li>
      ))}
    </ul>
  );
}

export function HubPhases({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const id = useId();
  const [selected, setSelected] = useState(0);
  // true while the first phase waits, unseen, to play its entrance
  const [waiting, setWaiting] = useState(false);
  const demoRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // On a phone the tabs scroll sideways: say which edges have more past them, so the stylesheet
  // fades those edges. Written on the element, so scrolling never re-renders the section.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const mark = () => {
      const start = scroller.scrollLeft > 1;
      const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      const more = start && end ? "both" : start ? "start" : end ? "end" : null;
      if (more) scroller.setAttribute("data-more", more);
      else scroller.removeAttribute("data-more");
    };
    mark();
    scroller.addEventListener("scroll", mark, { passive: true });
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(mark) : null;
    resized?.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", mark);
      resized?.disconnect();
    };
  }, []);

  useEffect(() => {
    const demo = demoRef.current;
    if (!demo || typeof window.IntersectionObserver !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // content already on screen when the page opens is never held back
    if (demo.getBoundingClientRect().top <= window.innerHeight) return;
    setWaiting(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setWaiting(false);
        observer.disconnect();
      },
      { threshold: ENTRANCE_THRESHOLD },
    );
    observer.observe(demo);
    return () => observer.disconnect();
  }, []);

  const select = (index: number, focus = false) => {
    setSelected(index);
    setWaiting(false);
    const tab = tabRefs.current[index];
    // the tabs scroll sideways on a phone: keep the chosen one in sight
    tab?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
    if (focus) tab?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const last = t.phases.length - 1;
    const next = {
      ArrowRight: selected === last ? 0 : selected + 1,
      ArrowLeft: selected === 0 ? last : selected - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next, true);
  };

  const views = [
    <NotesView key="notes" items={t.phases[0].items!} />,
    <ArchView key="arch" items={t.phases[1].items!} />,
    <CommitsView key="commits" />,
    <ChecksView key="checks" items={t.phases[3].items!} done={t.done} />,
  ];

  return (
    <section className={`${styles.block} ${styles.warm}`} data-tile-bg="" id="hub" aria-labelledby="hub-title">
      <div className={styles.wrap}>
        <h2 id="hub-title">
          <HeadingText text={t.title} />
        </h2>
        <p className={styles.lead}>{t.lead}</p>

        <div className={s.demo} ref={demoRef} data-waiting={waiting}>
          <div className={s.scroller} ref={scrollerRef}>
            <div className={s.track}>
              <div className={s.tabs} role="tablist" aria-label={t.tablist} onKeyDown={onKeyDown}>
                {t.phases.map((phase, i) => (
                  <button
                    key={phase.name}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`${id}-tab-${i}`}
                    className={s.tab}
                    aria-selected={selected === i}
                    aria-controls={`${id}-panel-${i}`}
                    tabIndex={selected === i ? 0 : -1}
                    onClick={() => select(i)}
                  >
                    <span className={s.num}>{`0${i + 1}`}</span>
                    <span className={s.tabName}>{phase.name}</span>
                  </button>
                ))}
              </div>
              {/* one element: it spans the rail, is cut to a quarter and moved to the tab */}
              <div className={s.rail} aria-hidden="true">
                <span className={s.marker} style={{ "--sel": selected } as CSSProperties} />
              </div>
            </div>
          </div>

          <div className={s.panels}>
            {t.phases.map((phase, i) => (
              <div
                key={phase.name}
                role="tabpanel"
                id={`${id}-panel-${i}`}
                aria-labelledby={`${id}-tab-${i}`}
                className={s.panel}
                data-active={selected === i}
                data-live={selected === i && !waiting}
                aria-hidden={selected !== i}
                inert={selected !== i}
              >
                <p className={s.text}>{phase.text}</p>
                <figure className={s.figure}>
                  <div className={s.stage}>{views[i]}</div>
                  <figcaption className={s.caption}>{phase.view}</figcaption>
                </figure>
              </div>
            ))}
          </div>

          <p className={s.closing}>{t.closing}</p>
        </div>
      </div>
    </section>
  );
}
