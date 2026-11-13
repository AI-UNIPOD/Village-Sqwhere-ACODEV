"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ViewTransition, addTransitionType, startTransition, useEffect, useRef, useState } from "react";

import { AppFrame } from "../app-frame";
import { GatherHero } from "../landing/gather-hero";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { useMe } from "../session/me";
import { RequireSession } from "../session/session-ui";
import { copy, fill } from "./copy";
import { DoneStep } from "./done-step";
import { ArrowLeft } from "./icons";
import styles from "./onboarding.module.css";
import { OnboardingSkeleton } from "./onboarding-skeleton";
import { firstName, toProfile, type Profile } from "./options";
import { CountryStep, FeedStep, RoleStep, StackStep, TopicsStep } from "./question-steps";
import { useSavedAnswers } from "./saved-answers";
import {
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
// browser's back button works. Answers live in this component's state and in sessionStorage.
export function Onboarding({ lang, profile }: { lang: Lang; profile: Profile }) {
  const t = copy[lang];
  const router = useRouter();
  const requested = parseStep(useSearchParams().get("step"));
  const { answers, ready, change } = useSavedAnswers();
  const [missing, setMissing] = useState<StepId | null>(null);
  const [roleEntrance, setRoleEntrance] = useState(false);
  // Until the saved answers are back, a later step must not be sent to the first question.
  const step = ready ? reachable(requested, answers) : requested;
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
    // Only the way in from the welcome screen plays the role cards' entrance.
    setRoleEntrance(to === "role" && direction === "forward");
    startTransition(() => {
      addTransitionType(`step-${direction}`);
      router.push(stepHref(lang, to), { scroll: false });
    });
  }

  const move = (by: 1 | -1) => go(STEP_IDS[STEP_IDS.indexOf(step) + by], by === 1 ? "forward" : "back");

  function update(patch: Partial<Answers>) {
    change({ ...answers, ...patch });
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
          {fill(t.welcomeTitle, { name: firstName(profile) })}
        </h1>
        <p className={landing.sub}>{t.welcomeSub}</p>
        <p className={styles.signedIn}>{fill(t.signedIn, { username: profile.username })}</p>
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
    body = <DoneStep lang={lang} answers={answers} profile={profile} onChange={() => go("role", "back")} />;
  } else {
    body = (
      <div className={`${styles.column} ${styles.step}`}>
        {step === "role" && <RoleStep {...props} entrance={roleEntrance} />}
        {step === "stack" && <StackStep {...props} />}
        {step === "country" && <CountryStep {...props} />}
        {step === "topics" && <TopicsStep {...props} />}
        {step === "feed" && <FeedStep {...props} />}
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
    <AppFrame lang={lang} path="onboarding" bare>
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
    </AppFrame>
  );
}

// A developer who already has a role is past onboarding: its bare address sends them home.
// A link to a step ("Change my answers") still opens it.
function WithProfile({ lang }: { lang: Lang }) {
  const me = useMe();
  const router = useRouter();
  const hasStep = useSearchParams().has("step");
  const returning = !!me && me.roles.length > 0 && !hasStep;
  useEffect(() => {
    if (returning) router.replace(`/${lang}/village`);
  }, [lang, returning, router]);
  return me && !returning ? <Onboarding lang={lang} profile={toProfile(me)} /> : <OnboardingSkeleton />;
}

// The page is only for a signed-in developer, greeted by their own GitHub name.
export function SignedInOnboarding({ lang }: { lang: Lang }) {
  return (
    <RequireSession lang={lang} fallback={<OnboardingSkeleton />}>
      <WithProfile lang={lang} />
    </RequireSession>
  );
}
