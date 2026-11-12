"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, addTransitionType, startTransition, useEffect, useRef, useState } from "react";

import { GatherHero } from "../landing/gather-hero";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { Logo } from "../logo";
import { copy, fill } from "./copy";
import { DoneStep } from "./done-step";
import { ArrowLeft } from "./icons";
import styles from "./onboarding.module.css";
import { DEMO_PROFILE, firstName } from "./options";
import { CountryStep, RoleStep, StackStep, TopicsStep } from "./question-steps";
import {
  NO_ANSWERS,
  QUESTIONS,
  REQUIRED,
  STEP_IDS,
  isAnswered,
  isQuestion,
  parseStep,
  reachable,
  stepHref,
  type Answers,
  type StepId,
} from "./steps";

// The class names are the ::view-transition rules in globals.css. Anything without a direction
// (a reload, the browser's own back button) changes step without moving.
const SLIDE = { "step-forward": "step-forward", "step-back": "step-back", default: "none" };

// The whole flow: one question per screen, the screen held in the URL as ?step= so the
// browser's back button works. Answers live in this component's state only for now.
export function Onboarding({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const other: Lang = lang === "en" ? "fr" : "en";
  const router = useRouter();
  const requested = parseStep(useSearchParams().get("step"));
  const [answers, setAnswers] = useState<Answers>(NO_ANSWERS);
  const [missing, setMissing] = useState<StepId | null>(null);
  const step = reachable(requested, answers);
  const shown = useRef(step);

  useEffect(() => {
    if (step !== requested) router.replace(stepHref(lang, step));
  }, [lang, requested, step, router]);

  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [step]);

  function go(to: StepId, direction: "forward" | "back") {
    startTransition(() => {
      addTransitionType(`step-${direction}`);
      router.push(stepHref(lang, to), { scroll: false });
    });
  }

  const move = (by: 1 | -1) => go(STEP_IDS[STEP_IDS.indexOf(step) + by], by === 1 ? "forward" : "back");

  function update(patch: Partial<Answers>) {
    setAnswers((current) => ({ ...current, ...patch }));
    setMissing(null);
  }

  function advance() {
    if (isQuestion(step) && !isAnswered(step, answers)) setMissing(step);
    else move(1);
  }

  const n = isQuestion(step) ? QUESTIONS.indexOf(step) + 1 : 0;
  const total = QUESTIONS.length;
  const announcement = isQuestion(step) ? fill(t.stepAnnounce, { n, total, title: t[step].title }) : "";
  const props = { lang, answers, update, error: missing === step };

  let body;
  if (step === "welcome") {
    body = (
      <GatherHero labelledBy="welcome-title" labels={{ pause: t.pause, play: t.play }}>
        <h1 id="welcome-title" className={styles.title} tabIndex={-1}>
          {fill(t.welcomeTitle, { name: firstName(DEMO_PROFILE) })}
        </h1>
        <p className={landing.sub}>{t.welcomeSub}</p>
        <p className={styles.signedIn}>{fill(t.signedIn, { username: DEMO_PROFILE.username })}</p>
        <div className={landing.ctas}>
          <button type="button" className={`${landing.btn} ${landing.heroButton}`} onClick={() => move(1)}>
            {t.start}
          </button>
          <button
            type="button"
            className={`${landing.ghost} ${landing.heroButton}`}
            onClick={() => go("done", "forward")}
          >
            {t.skipForNow}
          </button>
        </div>
      </GatherHero>
    );
  } else if (step === "done") {
    body = <DoneStep lang={lang} answers={answers} profile={DEMO_PROFILE} onChange={() => go("role", "back")} />;
  } else {
    body = (
      <div className={`${styles.column} ${styles.step}`}>
        {step === "role" && <RoleStep {...props} />}
        {step === "stack" && <StackStep {...props} />}
        {step === "country" && <CountryStep {...props} />}
        {step === "topics" && <TopicsStep {...props} />}
        <div className={`${styles.actions} ${styles.questionActions}`}>
          <button type="button" className={landing.btn} onClick={advance}>
            {t.next}
          </button>
          {!REQUIRED.includes(step) && (
            <button type="button" className={landing.ghost} onClick={() => move(1)}>
              {t.skip}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header} data-site-header="">
        <Link className={`${landing.brand} ${styles.brand}`} href={`/${lang}`}>
          <Logo size={32} className={landing.navLogo} />
          <span className={landing.navWordmark} translate="no">Village Sqwhere</span>
        </Link>
        {/* A plain link on purpose: a full page load, as on the landing page. */}
        <a
          className={landing.navLink}
          href={`/${other}/onboarding`}
          hrefLang={other}
          lang={other}
          translate="no"
        >
          {t.switchText}
        </a>
      </header>
      <main className={styles.main}>
        {n > 0 && (
          <div className={`${styles.column} ${styles.top}`}>
            <button type="button" className={styles.back} onClick={() => move(-1)}>
              <ArrowLeft />
              {t.back}
            </button>
            <p className={styles.count}>{fill(t.stepOf, { n, total })}</p>
            <div className={styles.progress} aria-hidden="true">
              {QUESTIONS.map((question, i) => (
                <span key={question} data-done={i < n || undefined} />
              ))}
            </div>
          </div>
        )}
        <ViewTransition key={step} enter={SLIDE} exit={SLIDE} default="none">
          {body}
        </ViewTransition>
      </main>
      <p className={landing.srOnly} role="status">
        {announcement}
      </p>
    </div>
  );
}
