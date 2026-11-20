"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { Lang } from "../../locales";
import { HeadingText } from "../heading-text";
import { copy, SAMPLE_PHASE, type Copy } from "./how-it-works-copy";
import s from "./how-it-works.module.css";
import styles from "../landing-page.module.css";

// The step being read is the one crossing a thin band just above the middle of the screen.
const READING_BAND = "-47% 0px -47% 0px";
// Phones, with motion allowed: the steps stack as cards that layer over each other as the page
// scrolls (how-it-works.module.css). Otherwise, and on wider screens, they stay a list.
const STACK = "(max-width: 767px) and (prefers-reduced-motion: no-preference)";

function Check() {
  return (
    <svg className={s.check} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span className={s.avatar} aria-hidden="true">
      {initials}
    </span>
  );
}

function IdeaView({ t }: { t: Copy }) {
  const { idea } = t;
  return (
    <div className={s.card}>
      <span className={s.draft}>{idea.draft}</span>
      <p className={s.ideaTitle}>{idea.title}</p>
      <p className={s.meta}>{idea.sharedBy}</p>
      <p className={s.pitch}>{idea.pitch}</p>
      <p className={s.fieldLabel}>{idea.rolesNeeded}</p>
      <ul className={s.roles}>
        {idea.roles.map((role) => (
          <li key={role} className={s.role}>
            <Check />
            {role}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MatchesView({ t }: { t: Copy }) {
  return (
    <div className={s.card}>
      <p className={s.matcherTag}>{t.matcher.tag}</p>
      <ul className={s.rows}>
        {t.matcher.matches.map((m) => (
          <li key={m.name} className={s.match}>
            <Avatar initials={m.initials} />
            <div className={s.matchBody}>
              <p className={s.nameLine}>
                <span className={s.name}>{m.name}</span>
                <span className={s.verified}>
                  <Check />
                  {m.verified}
                </span>
              </p>
              <p className={s.meta}>{m.country}</p>
              <ul className={s.techs}>
                {m.tech.map((tech) => (
                  <li key={tech} className={s.tech}>
                    {tech}
                  </li>
                ))}
              </ul>
              <p className={s.why}>{m.why}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamView({ t }: { t: Copy }) {
  const { team } = t;
  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <p className={s.cardTitle}>{team.heading}</p>
        <p className={s.meta}>{team.count}</p>
      </div>
      <ul className={s.rows}>
        {team.members.map((m) => (
          <li key={m.name} className={s.member}>
            <Avatar initials={m.initials} />
            <div className={s.memberBody}>
              <p className={s.name}>{m.name}</p>
              <p className={s.meta}>{m.line}</p>
            </div>
            <span className={s.verified}>
              <Check />
              {m.signed}
            </span>
          </li>
        ))}
      </ul>
      <p className={`${s.meta} ${s.agreement}`}>
        {team.agreement}
        <br />
        {team.signedByAll}
      </p>
    </div>
  );
}

function HubView({ t }: { t: Copy }) {
  const { hub, idea } = t;
  return (
    <div className={s.card}>
      <p className={s.cardTitle}>{idea.title}</p>
      <p className={s.pills}>
        <span className={`${s.pill} ${s.pillActive}`}>
          <Check />
          {hub.active}
        </span>
        <span className={s.meta}>{hub.count}</span>
      </p>
      <p className={s.fieldLabel}>{hub.phasesHeading}</p>
      <div className={s.rail} aria-hidden="true">
        {hub.phases.map((phase, i) => (
          <span key={phase} data-on={i <= SAMPLE_PHASE ? "" : undefined} />
        ))}
      </div>
      <ol className={s.phases}>
        {hub.phases.map((phase, i) => (
          <li key={phase} className={s.phase} data-on={i === SAMPLE_PHASE ? "" : undefined}>
            <span className={s.num}>{`0${i + 1}`}</span>
            <span className={s.phaseName}>{phase}</span>
            <span className={s.meta}>
              {i < SAMPLE_PHASE ? hub.states.done : i === SAMPLE_PHASE ? hub.states.inProgress : hub.states.notStarted}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const VIEWS = [IdeaView, MatchesView, TeamView, HubView] as const;

function StepView({ t, index, active }: { t: Copy; index: number; active?: boolean }) {
  const View = VIEWS[index];
  return (
    <figure className={s.layer} data-view={index} data-active={active}>
      <View t={t} />
      <figcaption className={s.caption}>{t.steps[index].view}</figcaption>
    </figure>
  );
}

export function HowItWorks({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);
  const listRef = useRef<HTMLOListElement>(null);

  // The stack: each card's height goes to the stylesheet, which settles a card taller than the
  // screen only once its bottom is in view. As the next card slides up over one, --cover runs
  // from 0 to 1 and the one underneath sinks back. Written on the elements, so scrolling never
  // re-renders the section.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(STACK);
    const cards = Array.from(list.children) as HTMLElement[];
    let frame = 0;
    const measure = () => {
      for (const card of cards) card.style.setProperty("--h", `${card.offsetHeight}px`);
    };
    const depth = () => {
      frame = 0;
      const screen = window.innerHeight;
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const settle = parseFloat(getComputedStyle(next).top) || 0;
        const cover = (screen - next.getBoundingClientRect().top) / Math.max(1, screen - settle);
        card.style.setProperty("--cover", Math.min(1, Math.max(0, cover)).toFixed(3));
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(depth);
    };
    const resized = typeof ResizeObserver === "function" ? new ResizeObserver(() => (measure(), onScroll())) : null;
    const apply = () => {
      if (query.matches) {
        list.setAttribute("data-stack", "");
        measure();
        for (const card of cards) resized?.observe(card);
        window.addEventListener("scroll", onScroll, { passive: true });
        depth();
        return;
      }
      list.removeAttribute("data-stack");
      resized?.disconnect();
      window.removeEventListener("scroll", onScroll);
      for (const card of cards) {
        card.style.removeProperty("--h");
        card.style.removeProperty("--cover");
      }
    };
    apply();
    query.addEventListener?.("change", apply);
    return () => {
      query.removeEventListener?.("change", apply);
      resized?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (typeof window.IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(stepRefs.current.indexOf(entry.target as HTMLLIElement));
        }
      },
      { rootMargin: READING_BAND },
    );
    for (const el of stepRefs.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className={styles.block} id="how" aria-labelledby="how-title">
      <div className={styles.wrap}>
        <h2 id="how-title">
          <HeadingText text={t.title} />
        </h2>
        <p className={styles.lead}>{t.lead}</p>

        <div className={s.story}>
          <ol className={s.steps} ref={listRef}>
            {t.steps.map((step, i) => (
              <li
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={s.step}
                data-active={active === i}
                style={{ "--i": i } as CSSProperties}
              >
                <span className={s.stepNum}>{`0${i + 1}`}</span>
                <h3 className={s.stepTitle}>{step.title}</h3>
                <p className={s.stepText}>{step.text}</p>
                <div className={`${s.frame} ${s.inline}`}>
                  <StepView t={t} index={i} active />
                </div>
              </li>
            ))}
          </ol>

          {/* the stage repeats the views for wide screens, so it stays out of the reading order */}
          <div className={`${s.frame} ${s.stage}`} data-active={active} aria-hidden="true">
            {t.steps.map((step, i) => (
              <StepView key={step.title} t={t} index={i} active={active === i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
