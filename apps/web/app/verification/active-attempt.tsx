"use client";

import Link from "next/link";
import { useRef, useState, type ComponentType } from "react";

import { DEMO_READ_ONLY, NotSaved } from "../demo-refusal";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { AlertCircle, ArrowRight, Check, Clock } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError, apiFetch } from "../session/session";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { errorCode, type Actions, type Attempt } from "./use-verification";
import styles from "./verification.module.css";

type StageState = "done" | "now" | "later";
type PillKind = keyof (typeof copy)["en"]["pills"];

// The status says whose turn it is, the phase says where in the work the attempt is.
function stageStates({ status, current_phase }: Attempt): [StageState, StageState, StageState] {
  if (status === "awaiting_review") return ["done", "done", "now"];
  if (current_phase === "technical_defence") return ["done", "now", "later"];
  if (current_phase === "report_generation") return ["done", "done", "later"];
  return ["now", "later", "later"];
}

const PILLS: Record<PillKind, { Icon: ComponentType; state?: string; ai?: boolean }> = {
  done: { Icon: Check, state: "done" },
  yourTurn: { Icon: ArrowRight, state: "next" },
  waiting: { Icon: Clock, state: "later" },
  later: { Icon: Clock, state: "later" },
  // work the AI is doing right now: its colour and a ring that turns
  checking: { Icon: () => <span className={styles.ring} aria-hidden="true" />, ai: true },
  writing: { Icon: () => <span className={styles.ring} aria-hidden="true" />, ai: true },
};

function Pill({ kind, label }: { kind: PillKind; label: string }) {
  const { Icon, state, ai } = PILLS[kind];
  return (
    <span className={`${village.pill} ${ai ? styles.ai : ""}`} data-state={state}>
      <Icon />
      {label}
    </span>
  );
}

function StopAttempt({ lang, attemptId, actions }: { lang: Lang; attemptId: string; actions: Actions }) {
  const t = copy[lang].stop;
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<boolean | "demo">(false);

  async function stop() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setFailed(false);
    try {
      const response = await apiFetch(`/v1/me/verifications/${attemptId}/abandon`, { method: "POST" });
      const code = response.ok ? "" : await errorCode(response);
      if (response.ok) {
        actions.accept((await response.json()).data);
      } else if (response.status === 409 && code === "VERIFICATION_NOT_ACTIVE") {
        actions.reload();
      } else {
        setFailed(code === DEMO_READ_ONLY ? "demo" : true);
        return;
      }
      dialog.current?.close();
    } catch (error) {
      if (!(error instanceof SignedOutError)) setFailed(true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.quiet}
        onClick={() => {
          setFailed(false);
          dialog.current?.showModal();
          // the safe choice has focus, so a stray Enter keeps the attempt
          keep.current?.focus();
        }}
      >
        {t.button}
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="stop-title">
        <h2 id="stop-title" className={styles.dialogTitle}>
          {t.title}
        </h2>
        <p className={styles.dialogText}>{t.text}</p>
        {failed === "demo" && <NotSaved lang={lang} spaced />}
        {failed === true && (
          <p className={onboarding.error} role="alert">
            <AlertCircle />
            {t.failed}
          </p>
        )}
        <div className={onboarding.actions}>
          <button type="button" className={styles.danger} aria-busy={busy} onClick={stop}>
            {t.confirm}
          </button>
          <button ref={keep} type="button" className={landing.ghost} onClick={() => dialog.current?.close()}>
            {t.keep}
          </button>
        </div>
      </dialog>
    </>
  );
}

// State C: an attempt is under way. The three stages say what is done, what is happening and
// whose turn it is. The AI's work is shown as work in progress, never as a result.
export function ActiveAttempt({ lang, attempt, actions }: { lang: Lang; attempt: Attempt; actions: Actions }) {
  const t = copy[lang];
  const s = t.stages;
  const [first, second, third] = stageStates(attempt);
  const writing = second === "done" && third === "later";

  const stages: { id: string; title: string; state: StageState; text?: string; pills: [PillKind, string][] }[] = [
    {
      id: "repositories",
      title: s.repositories.title,
      state: first,
      text: first === "done" ? s.repositories.done : attempt.last_error ? s.repositories.retrying : s.repositories.now,
      pills: first === "done" ? [["done", t.pills.done]] : [["checking", t.pills.checking]],
    },
    {
      id: "interview",
      title: s.interview.title,
      state: second,
      text: second === "later" ? s.interview.later : second === "done" ? (writing ? s.interview.done : s.interview.ready) : undefined,
      pills:
        second === "later"
          ? [["later", t.pills.later]]
          : second === "now"
            ? [["yourTurn", t.pills.yourTurn]]
            : writing
              ? [["done", t.pills.done], ["writing", t.pills.writing]]
              : [["done", t.pills.done]],
    },
    {
      id: "review",
      title: s.review.title,
      state: third,
      text: third === "now" ? s.review.now : s.review.later,
      pills: third === "now" ? [["waiting", t.pills.waiting]] : [["later", t.pills.later]],
    },
  ];

  return (
    <>
      <h2 className={landing.srOnly}>{t.trackerTitle}</h2>
      <ol className={styles.steps}>
        {stages.map((stage, i) => (
          <li key={stage.id} className={styles.step} data-state={stage.state} aria-current={stage.state === "now" ? "step" : undefined}>
            <span className={styles.num} aria-hidden="true">
              {stage.state === "done" ? <Check /> : String(i + 1).padStart(2, "0")}
            </span>
            <div className={styles.body}>
              <div className={styles.stepHead}>
                <h3>{stage.title}</h3>
                {stage.pills.map(([kind, label]) => (
                  <Pill key={kind} kind={kind} label={label} />
                ))}
              </div>
              {stage.text && <p>{stage.text}</p>}
              {stage.id === "interview" && stage.state === "now" && (
                <>
                  <p className={styles.warning}>
                    <AlertCircle />
                    {s.interview.warning}
                  </p>
                  <Link className={`${landing.btn} ${styles.action}`} href={`/${lang}/verification/interview?id=${attempt.id}`}>
                    {s.interview.start}
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className={styles.reassure}>{t.reassure}</p>
      {attempt.language !== lang && <p className={styles.reassure}>{t.otherLanguage}</p>}

      <p className={styles.label}>{t.submitted}</p>
      <ul className={styles.repos}>
        {attempt.evidence.map(({ repository_url: url }) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              {url.replace("https://", "")} <span className={landing.srOnly}>({t.newTab})</span>
            </a>
          </li>
        ))}
      </ul>

      <div className={styles.stopRow}>
        <StopAttempt lang={lang} attemptId={attempt.id} actions={actions} />
      </div>
    </>
  );
}
