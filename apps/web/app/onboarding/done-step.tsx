"use client";

import type { CSSProperties } from "react";

import { SoonButton } from "../landing/landing-page";
import landing from "../landing/landing-page.module.css";
import { SectionMotion } from "../landing/section-motion";
import type { Lang } from "../locales";
import { copy, fill } from "./copy";
import styles from "./onboarding.module.css";
import { DEMO_PROFILE, FIRST_NAME, ROLES, TECHNOLOGIES, TOPICS, countriesFor } from "./options";
import type { Answers } from "./steps";

const initials = DEMO_PROFILE.displayName
  .split(" ")
  .map((word) => word[0])
  .join("");

// Static tags that arrive one after another once the card has landed (--i is the place).
function Tags({ label, items, mono }: { label: string; items: string[]; mono?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={styles.factLabel}>{label}</p>
      <ul className={styles.tags}>
        {items.map((item, i) => (
          <li
            key={item}
            className={`${styles.tag} ${mono ? styles.mono : ""}`}
            style={{ "--i": i } as CSSProperties}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DoneStep({ lang, answers, onChange }: { lang: Lang; answers: Answers; onChange: () => void }) {
  const t = copy[lang];
  const role = ROLES.find((r) => r.slug === answers.role);
  const country = countriesFor(lang).find((c) => c.code === answers.country);
  return (
    <div className={`${styles.column} ${styles.step}`}>
      <h1 className={styles.title} tabIndex={-1}>
        {fill(t.doneTitle, { name: FIRST_NAME })}
      </h1>
      <div className={styles.card}>
        <div className={styles.person}>
          <span className={styles.avatar} aria-hidden="true">
            {initials}
          </span>
          <div>
            <p className={styles.name}>{DEMO_PROFILE.displayName}</p>
            <p className={styles.username}>@{DEMO_PROFILE.username}</p>
          </div>
        </div>
        <p className={styles.fact}>{role ? role.name[lang] : t.noRole}</p>
        {country && <p className={styles.fact}>{country.name}</p>}
        {role ? (
          <>
            <Tags
              label={t.stackLabel}
              mono
              items={TECHNOLOGIES.filter((tech) => answers.stack.includes(tech.slug)).map((tech) => tech.name)}
            />
            <Tags
              label={t.topicsLabel}
              items={TOPICS.filter((topic) => answers.topics.includes(topic.slug)).map((topic) => topic.name[lang])}
            />
          </>
        ) : (
          <p className={styles.muted}>{t.finishLater}</p>
        )}
      </div>
      <h2 className={styles.subtitle}>{t.nextTitle}</h2>
      <ol className={styles.next}>
        {t.nextSteps.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ol>
      <p className={styles.muted}>{t.preview}</p>
      <div className={styles.actions}>
        <SoonButton className={landing.btn} soon={t.soon} announce={t.soon}>
          {t.village}
        </SoonButton>
        <button type="button" className={landing.ghost} onClick={onChange}>
          {role ? t.change : t.start}
        </button>
      </div>
      {/* where a "coming soon" press is announced (SectionMotion fills it) */}
      <p className={landing.srOnly} role="status" data-soon-status="" />
      <SectionMotion />
    </div>
  );
}
