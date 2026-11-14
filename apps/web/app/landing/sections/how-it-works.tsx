"use client";

import { useEffect, useRef, useState } from "react";

import type { Lang } from "../../locales";
import { copy, type Copy } from "./how-it-works-copy";
import s from "./how-it-works.module.css";
import styles from "../landing-page.module.css";

// The step being read is the one crossing a thin band just above the middle of the screen.
const READING_BAND = "-47% 0px -47% 0px";

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
              <p className={s.meta}>{m.city}</p>
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
        <span className={`${s.pill} ${s.pillSample}`}>{hub.sample}</span>
        <span className={s.meta}>{hub.count}</span>
      </p>
      <p className={s.fieldLabel}>{hub.phasesHeading}</p>
      <div className={s.rail} aria-hidden="true">
        <span data-on="" />
        <span />
        <span />
        <span />
      </div>
      <ol className={s.phases}>
        {hub.phases.map((phase, i) => (
          <li key={phase} className={s.phase} data-on={i === 0 ? "" : undefined}>
            <span className={s.num}>{`0${i + 1}`}</span>
            <span className={s.phaseName}>{phase}</span>
            <span className={s.meta}>{i === 0 ? hub.inProgress : hub.notStarted}</span>
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
        <h2 id="how-title">{t.title}</h2>
        <p className={styles.lead}>{t.lead}</p>

        <div className={s.story}>
          <ol className={s.steps}>
            {t.steps.map((step, i) => (
              <li
                key={step.title}
                ref={(el) => {
                  stepRefs.current[i] = el;
                }}
                className={s.step}
                data-active={active === i}
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
