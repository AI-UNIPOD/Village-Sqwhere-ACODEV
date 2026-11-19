"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { AppFrame } from "../app-frame";
import { notSaved } from "../demo-refusal";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, TriangleAlert } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError, apiFetch } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { copy } from "./copy";
import styles from "./interview.module.css";
import { MAX_ANSWER, useInterview, type Problem, type Status, type Turn } from "./use-interview";

type Attempt = { status: string; current_phase: string | null };
type Reason = "checking" | "answered" | "review" | "ended";

// The interview opens only for an attempt that is in progress and at its interview phase.
function reasonOf({ status, current_phase }: Attempt): Reason | null {
  if (status === "in_progress") {
    if (current_phase === "technical_defence") return null;
    return current_phase === "report_generation" ? "answered" : "checking";
  }
  if (status === "pending") return "checking";
  return status === "awaiting_review" ? "review" : "ended";
}

// An id the API does not know is a 404, and one that is not a UUID is a 422.
async function loadAttempt(id: string): Promise<Attempt | "missing"> {
  const response = await apiFetch(`/v1/me/verifications/${encodeURIComponent(id)}`);
  if (response.status === 404 || response.status === 422) return "missing";
  const attempt = (await response.json().catch(() => null))?.data;
  if (!response.ok || typeof attempt?.status !== "string") {
    throw new Error(`GET /v1/me/verifications answered ${response.status}`);
  }
  return attempt;
}

// The attempt, "missing", or null while loading. A failure is thrown during render, so the
// page's error screen offers Try again.
function useAttempt(id: string | null): Attempt | "missing" | null {
  const [result, setResult] = useState<Attempt | "missing" | Error | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadAttempt(id).then(
      (attempt) => live && setResult(attempt),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setResult(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);
  const found = id ? result : "missing";
  if (found instanceof Error) throw found;
  return found;
}

function Shell(props: { lang: Lang; children: ReactNode; busy?: boolean; locked?: boolean }) {
  const { lang, children, busy, locked } = props;
  return (
    <AppFrame lang={lang} path="verification" locked={locked}>
      <main className={`${onboarding.column} ${styles.main}`} aria-busy={busy}>
        {children}
      </main>
    </AppFrame>
  );
}

export function InterviewSkeleton({ lang }: { lang: Lang }) {
  return (
    <Shell lang={lang} busy>
      <p className={landing.srOnly} role="status">
        {copy[lang].loading}
      </p>
      <div className={onboarding.skeleton} aria-hidden="true">
        <div className={`${onboarding.block} ${onboarding.blockTitle}`} />
        <div className={onboarding.block} />
        <div className={`${onboarding.block} ${onboarding.blockText}`} />
        <div className={onboarding.block} />
        <div className={onboarding.spinner} />
      </div>
    </Shell>
  );
}

type Kind = "warning" | "success" | "error" | "info";

const KIND_ICONS = { warning: TriangleAlert, success: Check, error: AlertCircle, info: AlertCircle };

// An inline note: an icon tile, what happened, and what it means.
function Message({ kind, title, text, role }: { kind: Kind; title: string; text: string; role?: "status" | "alert" }) {
  const KindIcon = KIND_ICONS[kind];
  return (
    <div className={styles.message} data-kind={kind} role={role}>
      <span className={styles.tile}>
        <KindIcon />
      </span>
      <div>
        <p className={styles.messageTitle}>{title}</p>
        <p className={styles.messageText}>{text}</p>
      </div>
    </div>
  );
}

function BackLink({ lang, main = true }: { lang: Lang; main?: boolean }) {
  return (
    <Link className={main ? landing.btn : landing.ghost} href={`/${lang}/verification`}>
      {copy[lang].back}
    </Link>
  );
}

function Unavailable({ lang, say }: { lang: Lang; say: { title: string; text: string } }) {
  return (
    <Shell lang={lang}>
      <h1 className={onboarding.title}>{say.title}</h1>
      <p className={onboarding.why}>{say.text}</p>
      <div className={onboarding.actions}>
        <BackLink lang={lang} />
      </div>
    </Shell>
  );
}

function Intro({ lang, begin }: { lang: Lang; begin: () => void }) {
  const t = copy[lang];
  return (
    <>
      <h1 className={onboarding.title}>{t.title}</h1>
      <p className={onboarding.why}>{t.lead}</p>
      <ul className={styles.expect}>
        {t.expect.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Message kind="warning" title={t.warning.title} text={t.warning.text} />
      <div className={onboarding.actions}>
        <button type="button" className={landing.btn} onClick={begin}>
          {t.begin}
        </button>
        <Link className={landing.ghost} href={`/${lang}/verification`}>
          {t.notNow}
        </Link>
      </div>
    </>
  );
}

function TurnView({ lang, turn }: { lang: Lang; turn: Turn }) {
  const t = copy[lang];
  return (
    <div className={styles.turn} data-from={turn.from}>
      <p className={styles.who}>
        {turn.from === "ai" ? t.interviewer : t.you}
        {turn.sequence !== undefined && <span className={styles.number}>{fill(t.question, { n: turn.sequence })}</span>}
      </p>
      <p className={styles.said}>{turn.text}</p>
    </div>
  );
}

// The newest message stays in view, with no gliding when the person asked for less motion.
function useKeepNewestInView(turns: number, status: Status) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({ block: "end", behavior: calm ? "instant" : "smooth" });
  }, [turns, status]);
  return end;
}

function Transcript({ lang, turns, status }: { lang: Lang; turns: Turn[]; status: Status }) {
  const t = copy[lang];
  const end = useKeepNewestInView(turns.length, status);
  const wait = status === "connecting" ? t.connecting : status === "reading" ? t.reading : null;
  return (
    <div className={styles.log} role="log" aria-live="polite" aria-label={t.transcript}>
      {turns.map((turn) => (
        <TurnView key={turn.id} lang={lang} turn={turn} />
      ))}
      {wait && (
        <p className={styles.pending}>
          <span className={`${onboarding.spinner} ${styles.ring}`} aria-hidden="true" />
          {wait}
        </p>
      )}
      <div ref={end} className={styles.end} />
    </div>
  );
}

function Composer({
  lang,
  open,
  draft,
  problem,
  edit,
  send,
}: {
  lang: Lang;
  open: boolean;
  draft: string;
  problem: Problem | null;
  edit: (value: string) => void;
  send: () => void;
}) {
  const t = copy[lang];
  const field = useRef<HTMLTextAreaElement>(null);
  // A disabled field cannot keep focus, so it comes back each time a question is open again.
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  const length = draft.trim().length;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <label className={styles.label} htmlFor="answer">
        {t.answerLabel}
      </label>
      <textarea
        id="answer"
        ref={field}
        className={`${onboarding.input} ${styles.answer}`}
        value={draft}
        disabled={!open}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? "answer-problem" : "answer-help"}
        onChange={(event) => edit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            send();
          }
        }}
      />
      {problem && (
        <p id="answer-problem" className={`${onboarding.error} ${styles.problem}`}>
          <AlertCircle />
          {t.problems[problem]}
        </p>
      )}
      <div className={styles.row}>
        <button type="submit" className={landing.btn} aria-disabled={!open || undefined}>
          {t.send}
        </button>
        <p id="answer-help" className={styles.hint}>
          {t.helper}
        </p>
        {length > MAX_ANSWER * 0.9 && (
          <p className={styles.count} data-over={length > MAX_ANSWER || undefined}>
            {fill(t.count, { count: length.toLocaleString(lang) })}
          </p>
        )}
      </div>
    </form>
  );
}

function LeaveDialog({ lang, leave, dialog }: { lang: Lang; leave: () => void; dialog: RefObject<HTMLDialogElement | null> }) {
  const t = copy[lang];
  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="leave-title">
      <h2 id="leave-title" className={styles.dialogTitle}>
        {t.leaveTitle}
      </h2>
      <p className={styles.messageText}>{t.leaveText}</p>
      <div className={styles.dialogActions}>
        {/* first, so the browser puts focus on the safe choice when the dialog opens */}
        <button type="button" className={landing.ghost} onClick={() => dialog.current?.close()}>
          {t.stay}
        </button>
        <button
          type="button"
          className={`${landing.ghost} ${styles.danger}`}
          onClick={() => {
            dialog.current?.close();
            leave();
          }}
        >
          {t.leaveConfirm}
        </button>
      </div>
    </dialog>
  );
}

const ENDINGS = {
  complete: { kind: "success", say: "finished" },
  left: { kind: "info", say: "left" },
  dropped: { kind: "error", say: "dropped" },
  refused: { kind: "error", say: "refused" },
  // the same title; under it, what the demo says where a failure would say why
  demo: { kind: "error", say: "refused" },
} as const;

function Conversation({ lang, attemptId }: { lang: Lang; attemptId: string }) {
  const t = copy[lang];
  const { status, turns, draft, problem, begin, send, leave, edit } = useInterview(attemptId);
  const dialog = useRef<HTMLDialogElement>(null);
  if (status === "idle") {
    return (
      <Shell lang={lang}>
        <Intro lang={lang} begin={begin} />
      </Shell>
    );
  }
  const live = status === "connecting" || status === "asking" || status === "reading";
  const ending = live ? null : ENDINGS[status];
  return (
    <Shell lang={lang} locked={live}>
      <div className={styles.head}>
        <h1 className={onboarding.title}>{t.title}</h1>
        {live && (
          <button type="button" className={styles.leave} onClick={() => dialog.current?.showModal()}>
            {t.leave}
          </button>
        )}
      </div>
      <Transcript lang={lang} turns={turns} status={status} />
      <div className={styles.dock}>
        {ending ? (
          <>
            <Message
              kind={ending.kind}
              title={t[ending.say].title}
              text={status === "demo" ? notSaved(lang) : t[ending.say].text}
              role={ending.kind === "error" ? "alert" : "status"}
            />
            <div className={styles.dockActions}>
              <BackLink lang={lang} />
            </div>
          </>
        ) : (
          <Composer lang={lang} open={status === "asking"} draft={draft} problem={problem} edit={edit} send={send} />
        )}
      </div>
      {live && <LeaveDialog lang={lang} leave={leave} dialog={dialog} />}
    </Shell>
  );
}

function WithAttempt({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  const attempt = useAttempt(id);
  if (!attempt) return <InterviewSkeleton lang={lang} />;
  if (attempt === "missing") return <Unavailable lang={lang} say={copy[lang].missing} />;
  const reason = reasonOf(attempt);
  if (reason) return <Unavailable lang={lang} say={copy[lang].unavailable[reason]} />;
  return <Conversation lang={lang} attemptId={id!} />;
}

// A live chat with the AI interviewer, the second stage of a Green Tick. Nothing opens the
// socket until the developer presses "Begin the interview".
export function Interview({ lang }: { lang: Lang }) {
  return (
    <RequireSession lang={lang} fallback={<InterviewSkeleton lang={lang} />}>
      <WithAttempt lang={lang} />
    </RequireSession>
  );
}
