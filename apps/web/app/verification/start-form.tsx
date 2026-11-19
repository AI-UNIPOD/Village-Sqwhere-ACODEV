"use client";

import { useRef, useState, type FormEvent } from "react";

import { DEMO_READ_ONLY, NotSaved } from "../demo-refusal";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError, apiFetch } from "../session/session";
import { copy, type Copy } from "./copy";
import { errorCode, type Actions } from "./use-verification";
import styles from "./verification.module.css";

const MAX_REPOSITORIES = 10;
const REPOSITORY = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/;

// The cleaned addresses (trimmed, no empty lines, no trailing slash), or the first thing wrong:
// the error names the first bad line, counted as the person sees it.
function parse(text: string, errors: Copy["form"]["errors"]): { repositories: string[]; error?: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line, i) => ({ address: line.trim().replace(/\/$/, ""), raw: line.trim(), number: i + 1 }))
    .filter(({ raw }) => raw);
  if (lines.length === 0) return { repositories: [], error: errors.empty };
  if (lines.length > MAX_REPOSITORIES) return { repositories: [], error: fill(errors.tooMany, { n: lines.length }) };
  const seen = new Set<string>();
  for (const { address, number } of lines) {
    if (!REPOSITORY.test(address)) return { repositories: [], error: fill(errors.notGithub, { n: number }) };
    if (seen.has(address.toLowerCase())) return { repositories: [], error: fill(errors.duplicate, { n: number }) };
    seen.add(address.toLowerCase());
  }
  return { repositories: lines.map(({ address }) => address) };
}

type Props = { lang: Lang; slug: string; attemptNumber: number; actions: Actions };

// The start form of state D. Asking for the AI check is the one main action on the screen.
export function StartForm({ lang, slug, attemptNumber, actions }: Props) {
  const t = copy[lang].form;
  const [text, setText] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<{ repositories?: string; consent?: string }>({});
  const [sendError, setSendError] = useState<"network" | "server" | "demo" | null>(null);
  const [busy, setBusy] = useState(false);
  // a second press can arrive before the page has drawn the busy state
  const sending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    const { repositories, error } = parse(text, t.errors);
    const consent = agreed ? undefined : t.errors.consent;
    setErrors({ repositories: error, consent });
    if (error || consent) return;

    sending.current = true;
    setBusy(true);
    setSendError(null);
    try {
      const response = await apiFetch(`/v1/me/verifications/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // the interview and the AI report are written in this language and it never changes
        body: JSON.stringify({ repositories, language: lang }),
      });
      if (response.status === 201) {
        actions.accept((await response.json()).data);
        return;
      }
      const code = await errorCode(response);
      if (response.status === 409 && (code === "VERIFICATION_IN_PROGRESS" || code === "VERIFICATION_CONFLICT")) {
        actions.reload();
      } else if (response.status === 409 && (code === "ROLE_ALREADY_VERIFIED" || code === "VERIFICATION_ATTEMPTS_EXHAUSTED")) {
        actions.refreshMe();
      } else if (response.status === 422) {
        setErrors({ repositories: t.errors.rejected });
      } else {
        setSendError(code === DEMO_READ_ONLY ? "demo" : "server");
      }
    } catch (failure) {
      if (!(failure instanceof SignedOutError)) setSendError("network");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const describedBy = ["verify-help", errors.repositories && "verify-error"].filter(Boolean).join(" ");

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.label}>{fill(t.attempt, { n: attemptNumber })}</p>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="verify-repositories">
          {t.label}
        </label>
        <p id="verify-help" className={styles.help}>
          {t.help}
        </p>
        <textarea
          id="verify-repositories"
          className={styles.textarea}
          value={text}
          rows={4}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!!errors.repositories}
          aria-describedby={describedBy}
          onChange={(event) => {
            setText(event.target.value);
            // once an error shows, it goes as soon as the text is right
            if (errors.repositories) setErrors((c) => ({ ...c, repositories: parse(event.target.value, t.errors).error }));
          }}
        />
        {errors.repositories && (
          <p id="verify-error" className={onboarding.error} role="alert">
            <AlertCircle />
            {errors.repositories}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={agreed}
            aria-invalid={!!errors.consent}
            aria-describedby={["verify-language", errors.consent && "verify-consent-error"].filter(Boolean).join(" ")}
            onChange={(event) => {
              setAgreed(event.target.checked);
              if (event.target.checked) setErrors((c) => ({ ...c, consent: undefined }));
            }}
          />
          <span>{t.consent}</span>
        </label>
        <p id="verify-language" className={styles.help}>
          {t.language}
        </p>
        {errors.consent && (
          <p id="verify-consent-error" className={onboarding.error} role="alert">
            <AlertCircle />
            {errors.consent}
          </p>
        )}
      </div>

      {sendError === "demo" && <NotSaved lang={lang} spaced />}
      {sendError && sendError !== "demo" && (
        <p className={onboarding.error} role="alert">
          <AlertCircle />
          {t.failed[sendError]}
        </p>
      )}
      <div>
        <button type="submit" className={`${landing.btn} ${styles.send}`} aria-busy={busy}>
          {t.submit}
          {busy && <span className={styles.ring} aria-hidden="true" />}
        </button>
      </div>
    </form>
  );
}
