"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import dialogStyles from "../confirm-dialog.module.css";
import { isDemoRefusal, notSaved } from "../demo-refusal";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError, signOut } from "../session/session";
import { copy } from "./copy";
import { deleteAccount } from "./profile-api";
import styles from "./profile.module.css";

type Problem = "mismatch" | "ownsHub" | "failed" | "demo";

// Deleting the account cannot be undone, so it takes two deliberate steps inside a dialog:
// ticking that the person understands, and typing their username. Until both are done the
// delete button does nothing, Enter included. Closing the dialog clears both.
export function DeleteAccount({ lang, username }: { lang: Lang; username: string }) {
  const t = copy[lang].deletion;
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // the API compares usernames without regard to capital letters
  const matches = typed.trim().toLowerCase() === username.toLowerCase();
  const ready = understood && matches && !busy;

  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open === open) return;
    // a browser without the dialog methods still shows and hides it, in the page
    if (open && element.showModal) element.showModal();
    else if (!open && element.close) element.close();
    else element.toggleAttribute("open", open);
  }, [open]);

  function start() {
    setUnderstood(false);
    setTyped("");
    setProblem(null);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setUnderstood(false);
    setTyped("");
  }

  async function remove(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteAccount(typed.trim());
      // the session belongs to an account that is gone: forget it and say goodbye
      signOut(lang, "/goodbye");
    } catch (error) {
      setBusy(false);
      if (error instanceof SignedOutError) return;
      if (isDemoRefusal(error)) setProblem("demo");
      else if (error instanceof IdeaError && error.code === "CONFIRMATION_MISMATCH") setProblem("mismatch");
      else if (error instanceof IdeaError && error.code === "OWNS_HUB_WITH_TEAM") setProblem("ownsHub");
      else setProblem("failed");
    }
  }

  const field = `${id}-username`;
  return (
    <section className={ideas.section} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={ideas.heading}>
        {t.heading}
      </h2>
      <p className={ideas.note}>{t.text}</p>
      <div className={styles.account}>
        <button type="button" className={`${landing.ghost} ${dialogStyles.danger}`} onClick={start}>
          {t.open}
        </button>
      </div>

      <dialog
        ref={dialog}
        className={dialogStyles.dialog}
        aria-labelledby={`${id}-title`}
        // Escape closes it, unless the deletion is being sent
        onCancel={(event) => busy && event.preventDefault()}
        onClose={() => open && close()}
      >
        <form noValidate onSubmit={remove}>
          <h2 id={`${id}-title`} className={dialogStyles.title}>
            {t.title}
          </h2>
          <div className={dialogStyles.text}>
            <p>{t.goes}</p>
            <ul className={styles.consequences}>
              {t.gone.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>{t.stays}</p>
            <ul className={styles.consequences}>
              {t.kept.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <label className={styles.understand}>
            <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.target.checked)} />
            <span>{t.understand}</span>
          </label>

          <div className={ideas.field}>
            <label htmlFor={field} className={ideas.label}>
              {t.username.label}
            </label>
            <input
              id={field}
              className={onboarding.input}
              value={typed}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={problem === "mismatch" || undefined}
              aria-describedby={`${field}-help${problem === "mismatch" ? ` ${field}-error` : ""}`}
              onChange={(event) => {
                setTyped(event.target.value);
                if (problem === "mismatch") setProblem(null);
              }}
            />
            <p id={`${field}-help`} className={ideas.help}>
              {fill(t.username.help, { username })}
            </p>
            {problem === "mismatch" && (
              <p id={`${field}-error`} className={onboarding.error} role="alert">
                <AlertCircle />
                {t.username.mismatch}
              </p>
            )}
          </div>

          {(problem === "ownsHub" || problem === "failed" || problem === "demo") && (
            <p className={onboarding.error} role="alert">
              <AlertCircle />
              <span>
                {problem === "ownsHub" ? t.ownsHub : problem === "demo" ? notSaved(lang) : t.failed}
                {problem === "ownsHub" && (
                  <>
                    {" "}
                    <Link href={`/${lang}/hubs`}>{t.hubs}</Link>
                  </>
                )}
              </span>
            </p>
          )}

          <div className={dialogStyles.actions}>
            <button
              type="submit"
              className={`${landing.ghost} ${dialogStyles.danger}`}
              aria-disabled={!ready || undefined}
              aria-busy={busy || undefined}
            >
              {t.confirm}
            </button>
            <button type="button" className={landing.ghost} onClick={close}>
              {t.cancel}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
