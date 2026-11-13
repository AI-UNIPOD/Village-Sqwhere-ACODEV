"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { copy } from "./copy";
import { decide, type Decision as Choice } from "./reviews";
import styles from "./reviews.module.css";

const MAX_NOTES = 2000;
const SHOW_COUNT_FROM = 1800;

// The reviewer's notes stay in this form until they confirm: nothing is stored or sent before.
// Both choices need notes, because the applicant learns from them, and both confirm first,
// because a decision cannot be taken back.
export function Decision({ lang, id, role, onClosed }: { lang: Lang; id: string; role: string; onClosed: () => void }) {
  const t = copy[lang];
  const router = useRouter();
  const ids = useId();
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  const [choice, setChoice] = useState<Choice>("passed");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const missing = tried && !notes.trim();
  const passing = choice === "passed";

  const ask = (next: Choice) => {
    if (sending) return;
    setTried(true);
    if (!notes.trim()) {
      field.current?.focus();
      return;
    }
    setChoice(next);
    setFailed(false);
    dialog.current?.showModal();
  };

  const confirm = async () => {
    if (sending) return;
    setSending(true);
    try {
      if ((await decide(id, choice, notes.trim())) === "closed") {
        dialog.current?.close();
        onClosed();
        return;
      }
      // stays busy until the queue opens
      router.push(`/${lang}/reviews?done=${choice}`);
    } catch {
      dialog.current?.close();
      setSending(false);
      setFailed(true);
    }
  };

  return (
    <div className={styles.decision}>
      <label className={styles.notesLabel} htmlFor={`${ids}-notes`}>
        {t.notesLabel}
      </label>
      <textarea
        id={`${ids}-notes`}
        ref={field}
        className={styles.notes}
        value={notes}
        maxLength={MAX_NOTES}
        aria-required="true"
        aria-invalid={missing}
        aria-describedby={[`${ids}-help`, missing && `${ids}-missing`, notes.length > SHOW_COUNT_FROM && `${ids}-count`]
          .filter(Boolean)
          .join(" ")}
        onChange={(event) => setNotes(event.target.value)}
      />
      <p id={`${ids}-help`} className={styles.help}>
        {t.notesHelp}
      </p>
      {notes.length > SHOW_COUNT_FROM && (
        <p id={`${ids}-count`} className={styles.help}>
          {fill(t.notesCount, { n: notes.length })}
        </p>
      )}
      {missing && (
        <p id={`${ids}-missing`} className={onboarding.error}>
          <AlertCircle />
          {t.notesEmpty}
        </p>
      )}
      {failed && (
        <p className={onboarding.error} role="alert">
          <AlertCircle />
          {t.saveFailed}
        </p>
      )}
      <div className={styles.decide}>
        <button type="button" className={landing.btn} onClick={() => ask("passed")}>
          {t.pass}
        </button>
        <button type="button" className={`${landing.ghost} ${styles.danger}`} onClick={() => ask("failed")}>
          {t.fail}
        </button>
      </div>

      {/* An attempt being sent cannot be cancelled with Esc: the answer is already on its way. */}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby={`${ids}-title`}
        onCancel={(event) => sending && event.preventDefault()}
      >
        <h2 id={`${ids}-title`} className={styles.dialogTitle}>
          {passing ? t.passTitle : t.failTitle}
        </h2>
        <p>{passing ? fill(t.passText, { role }) : t.failText}</p>
        <div className={styles.decide}>
          <button type="button" className={landing.ghost} onClick={() => !sending && dialog.current?.close()}>
            {t.goBack}
          </button>
          <button
            type="button"
            className={passing ? landing.btn : `${landing.ghost} ${styles.danger}`}
            aria-busy={sending}
            aria-disabled={sending}
            onClick={confirm}
          >
            {passing ? t.passConfirm : t.failConfirm}
            {sending && <span className={styles.spinner} aria-hidden="true" />}
          </button>
        </div>
      </dialog>
    </div>
  );
}
