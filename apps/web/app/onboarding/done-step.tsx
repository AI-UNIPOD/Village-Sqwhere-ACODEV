"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { copy, fill } from "./copy";
import { AlertCircle } from "./icons";
import styles from "./onboarding.module.css";
import { ROLES, TECHNOLOGIES, TOPICS, countriesFor, firstName, type Profile } from "./options";
import { useSavedProfile } from "./save-answers";
import type { Answers } from "./steps";

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

type DoneStepProps = { lang: Lang; answers: Answers; profile: Profile; onChange: () => void };

export function DoneStep({ lang, answers, profile, onChange }: DoneStepProps) {
  const t = copy[lang];
  const { status, retry } = useSavedProfile(answers);
  const name = profile.displayName ?? profile.username;
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  const github = (text: string) => (
    <a href={`https://github.com/${encodeURIComponent(profile.username)}`} target="_blank" rel="noopener noreferrer">
      {text}{" "}
      <span className={landing.srOnly}>({t.githubProfile})</span>
    </a>
  );
  const role = ROLES.find((r) => r.slug === answers.role);
  const country = countriesFor(lang).find((c) => c.code === answers.country);
  return (
    <div className={`${styles.column} ${styles.step}`}>
      <h1 className={styles.title} tabIndex={-1}>
        {fill(t.doneTitle, { name: firstName(profile) })}
      </h1>
      <div className={styles.card}>
        <div className={styles.person}>
          <span className={styles.avatar} aria-hidden="true">
            {initials}
          </span>
          <div>
            <p className={styles.name}>{profile.displayName ?? github(profile.username)}</p>
            {profile.displayName && <p className={styles.username}>{github(`@${profile.username}`)}</p>}
          </div>
        </div>
        <p className={styles.fact}>{role ? role.name[lang] : t.noRole}</p>
        {country && <p className={styles.fact}>{country.name}</p>}
        {role ? (
          <>
            <Tags
              label={t.stackLabel}
              mono
              items={TECHNOLOGIES.filter((tech) => answers.stack.includes(tech.slug)).map((tech) => tech.name[lang])}
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
      {(status === "saving" || status === "saved") && (
        <p className={styles.muted} role="status">
          {status === "saving" ? t.saving : t.saved}
        </p>
      )}
      {status === "failed" && (
        <>
          <p className={styles.error} role="alert">
            <AlertCircle />
            {t.saveFailed}
          </p>
          <button type="button" className={`${landing.ghost} ${styles.retry}`} onClick={retry}>
            {t.retry}
          </button>
        </>
      )}
      <div className={styles.actions}>
        {/* the village reads the role from the API, so the way there waits for the save */}
        {status === "saving" ? (
          <button type="button" className={landing.btn} aria-disabled="true">
            {t.village}
          </button>
        ) : (
          <Link className={landing.btn} href={`/${lang}/village`}>
            {t.village}
          </Link>
        )}
        <button type="button" className={landing.ghost} onClick={onChange}>
          {role ? t.change : t.start}
        </button>
      </div>
    </div>
  );
}
