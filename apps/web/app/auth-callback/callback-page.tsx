"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { copy as landing } from "../landing/copy";
import landingStyles from "../landing/landing-page.module.css";
import { ThemeToggle } from "../landing/theme-toggle";
import { hasLocale, type Lang } from "../locales";
import { Logo } from "../logo";
import { API_URL, isTokenData, saveSession } from "../session/session";
import { PKCE_VERIFIER_KEY, SIGN_IN_LANG_KEY } from "../sign-in/sign-in-page";
import { copy, type ProblemKey } from "./copy";
import styles from "./callback-page.module.css";

type Status = "loading" | "success" | ProblemKey;

// Blocked storage reads as empty, so the page explains the problem instead of hanging.
function readTab(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

// Trades the one-time login code for a session. The code works once, so each outcome is told
// apart: only a network failure leaves it possibly still valid.
async function exchange(code: string, verifier: string): Promise<Status> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "login_code", login_code: code, code_verifier: verifier }),
    });
  } catch {
    return "network";
  }
  if (response.status === 401) return "refused";
  const body = await response.json().catch(() => null);
  if (!response.ok || !isTokenData(body?.data)) return "other";
  try {
    saveSession(body.data);
  } catch {
    return "other";
  }
  try {
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(SIGN_IN_LANG_KEY);
  } catch {
    // storage blocked: nothing was kept to remove
  }
  return "success";
}

async function finishSignIn(lang: Lang, code: string, setStatus: Dispatch<SetStateAction<Status>>) {
  setStatus("loading");
  const verifier = readTab(PKCE_VERIFIER_KEY);
  const result: Status = !code ? "noCode" : verifier ? await exchange(code, verifier) : "noVerifier";
  setStatus(result);
  // replace, not assign: Back must not return to a code that has been used
  if (result === "success") window.location.replace(`/${lang}/onboarding`);
}

function Icon({ kind }: { kind: "success" | "error" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "success" ? (
        <path d="M20 6 9 17l-5-5" />
      ) : (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </>
      )}
    </svg>
  );
}

export function CallbackPage({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const shared = landing[lang];
  const [status, setStatus] = useState<Status>("loading");
  const loginCode = useRef("");
  const started = useRef(false);
  const messageRef = useRef<HTMLDivElement>(null);
  const problem = status === "loading" || status === "success" ? null : status;

  useEffect(() => {
    // A login code works once and React runs effects twice in development, so only the first run goes on.
    if (started.current) return;
    started.current = true;
    // The API sends everyone back to one address and the proxy picks a language from the
    // browser, so return to the language sign-in started in, before the one-time code is used.
    const startedIn = readTab(SIGN_IN_LANG_KEY);
    if (startedIn && hasLocale(startedIn) && startedIn !== lang) {
      window.location.replace(`/${startedIn}/auth/callback${window.location.search}`);
      return;
    }
    // The page is prerendered, so the query can only be read here.
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const code = params.get("login_code") ?? "";
    if (error) {
      // the sign-in page already explains each failure the API can send
      window.location.replace(`/${lang}/sign-in?error=${encodeURIComponent(error)}`);
    } else {
      loginCode.current = code;
      void finishSignIn(lang, code, setStatus);
    }
  }, [lang]);

  useEffect(() => {
    if (problem) messageRef.current?.focus();
  }, [problem]);

  const message = problem ? t.problems[problem] : t[status === "success" ? "success" : "loading"];
  const kind = problem ? "error" : status === "success" ? "success" : "pending";

  return (
    <div>
      <header className={landingStyles.nav} data-site-header="">
        <Link className={landingStyles.brand} href={`/${lang}`}>
          <Logo size={24} className={landingStyles.navLogo} />
          <span className={landingStyles.navWordmark} translate="no">Village Sqwhere</span>
        </Link>
      </header>

      {/* No language link here: the login code works once, so the other language cannot reuse it. */}
      <ThemeToggle toDark={shared.toDark} toLight={shared.toLight} />

      <main className={styles.main}>
        <div className={styles.column}>
          <div
            className={styles.message}
            data-kind={kind}
            key={status}
            role={problem ? "alert" : status === "success" ? "status" : undefined}
            aria-busy={status === "loading"}
            tabIndex={problem ? -1 : undefined}
            ref={problem ? messageRef : undefined}
          >
            <span className={styles.tile}>
              {kind === "pending" ? <span className={styles.ring} /> : <Icon kind={kind} />}
            </span>
            <div>
              <h1 className={styles.title}>{message.title}</h1>
              <p className={styles.text}>{message.text}</p>
              {problem && (
                <div className={styles.actions}>
                  {problem === "network" && (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => void finishSignIn(lang, loginCode.current, setStatus)}
                    >
                      {t.retry}
                    </button>
                  )}
                  <Link className={problem === "network" ? styles.link : styles.primary} href={`/${lang}/sign-in`}>
                    {t.problems[problem].link}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
