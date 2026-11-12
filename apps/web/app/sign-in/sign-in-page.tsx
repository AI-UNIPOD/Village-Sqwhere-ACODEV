"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { copy as landing } from "../landing/copy";
import { GatherHero } from "../landing/gather-hero";
import landingStyles from "../landing/landing-page.module.css";
import { ThemeToggle } from "../landing/theme-toggle";
import type { Lang } from "../locales";
import { Logo } from "../logo";
import { copy, type ProblemKey } from "./copy";
import styles from "./sign-in-page.module.css";

// The callback page reads the verifier from here to finish the sign-in.
export const PKCE_VERIFIER_KEY = "pkce_verifier";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Status = "idle" | "loading" | "redirecting" | ProblemKey;
type StepState = "todo" | "active" | "done" | "failed";

// The codes the API puts in `?error=` when GitHub sends the person back with a failure.
const FROM_GITHUB = new Map<string, ProblemKey>([
  ["INVALID_STATE", "invalidState"],
  ["ACCESS_DENIED", "accessDenied"],
  ["OAUTH_EXCHANGE_FAILED", "exchangeFailed"],
]);

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function createPkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

// Asks the API for the GitHub address to send the browser to.
async function startGitHub(): Promise<{ url: string } | { problem: ProblemKey }> {
  let challenge: string;
  try {
    const pkce = await createPkce();
    sessionStorage.setItem(PKCE_VERIFIER_KEY, pkce.verifier);
    challenge = pkce.challenge;
  } catch {
    // crypto.subtle is missing on plain http away from localhost, and storage can be blocked:
    // the network is fine, so do not say it dropped
    return { problem: "other" };
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/auth/oauth/github/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        redirect_uri: `${API_URL}/v1/auth/oauth/github/callback`,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }),
    });
  } catch {
    return { problem: "network" };
  }
  const body = await response.json().catch(() => null);
  if (response.ok && typeof body?.data?.authorize_url === "string") return { url: body.data.authorize_url };
  return { problem: body?.detail?.code === "PROVIDER_NOT_CONFIGURED" ? "notConfigured" : "other" };
}

// The callback page sends GitHub failures back here as `?error=CODE`. The address is read on
// the client: the page is prerendered, so it cannot know the query, and useSearchParams would
// push the whole page behind a Suspense boundary for one optional message. The server snapshot is
// empty, so the first paint matches the prerendered page.
const nobody = () => () => {};

function useReturnedProblem(): ProblemKey | null {
  const search = useSyncExternalStore(
    nobody,
    () => window.location.search,
    () => "",
  );
  const code = new URLSearchParams(search).get("error");
  // an unknown code still means GitHub did not finish: say so rather than show nothing
  return code ? (FROM_GITHUB.get(code) ?? "exchangeFailed") : null;
}

// custom property for the entrance stagger: the item's place in the copy block
const place = (i: number) => ({ "--i": i }) as CSSProperties;

function AlertIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

// Primer Octicons "mark-github", 16px. It takes the button's text colour and stays still.
function GitHubMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
    </svg>
  );
}

function Marker({ n, state }: { n: number; state: StepState }) {
  return (
    <span className={styles.marker} aria-hidden="true">
      {state === "done" ? (
        <svg
          className={styles.tick}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : state === "failed" ? (
        <AlertIcon />
      ) : (
        n
      )}
      {state === "active" && <span className={styles.ring} />}
    </span>
  );
}

export function SignInPage({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const shared = landing[lang];
  const other: Lang = lang === "en" ? "fr" : "en";
  const [status, setStatus] = useState<Status>("idle");
  const returned = useReturnedProblem();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const messageId = useId();
  const working = status === "loading" || status === "redirecting";
  const problem: ProblemKey | null = status === "idle" ? returned : working ? null : status;

  useEffect(() => {
    if (problem) messageRef.current?.focus();
  }, [problem]);

  async function start() {
    if (working) return;
    // the "Try again" button is about to go inert, so keep the keyboard on the page
    buttonRef.current?.focus();
    setStatus("loading");
    const result = await startGitHub();
    if ("problem" in result) {
      setStatus(result.problem);
      return;
    }
    setStatus("redirecting");
    window.location.assign(result.url);
  }

  const first: StepState = problem
    ? "failed"
    : status === "redirecting"
      ? "done"
      : status === "loading"
        ? "active"
        : "todo";
  const steps: [string, StepState][] = [
    [t.steps.approve, first],
    [t.steps.back, status === "redirecting" ? "active" : "todo"],
  ];

  return (
    <div>
      <header className={landingStyles.nav} data-site-header="">
        <Link className={landingStyles.brand} href={`/${lang}`}>
          <Logo size={24} className={landingStyles.navLogo} />
          <span className={landingStyles.navWordmark} translate="no">Village Sqwhere</span>
        </Link>
      </header>

      {/* A plain link on purpose, as on the landing page: a full page load keeps the theme. */}
      <a
        className={`${landingStyles.fab} ${landingStyles.fabTop}`}
        href={`/${other}/sign-in`}
        hrefLang={other}
        lang={other}
        translate="no"
        aria-label={shared.switchLabel}
      >
        {shared.switchText}
      </a>
      <ThemeToggle toDark={shared.toDark} toLight={shared.toLight} />

      <main>
        <GatherHero labelledBy="sign-in-title" labels={{ pause: shared.pause, play: shared.play }}>
          <h1 id="sign-in-title" className={styles.rise} style={place(0)}>
            {t.heading}
          </h1>
          <p className={`${landingStyles.sub} ${styles.rise}`} style={place(1)}>
            {t.intro}
          </p>

          <div className={`${styles.action} ${styles.rise}`} style={place(2)}>
            <button
              ref={buttonRef}
              type="button"
              className={styles.button}
              aria-disabled={working}
              aria-busy={working}
              onClick={start}
            >
              <GitHubMark />
              {t.button}
              {status === "loading" && <span className={styles.spinner} aria-hidden="true" />}
            </button>
          </div>

          <ol className={`${styles.track} ${styles.rise}`} style={place(3)} aria-label={t.stepsLabel}>
            {steps.map(([label, state], i) => (
              <li className={styles.step} data-state={state} key={label}>
                <Marker n={i + 1} state={state} />
                <span>
                  {label}
                  <span className={landingStyles.srOnly}>, {t.stepState[state]}</span>
                </span>
              </li>
            ))}
          </ol>

          {/* One line is always reserved, so the text appearing never changes the block's height. */}
          <div className={styles.working} role="status">
            {status === "redirecting" && t.working}
          </div>

          {/* The hero measures its text block only when the page width changes, so the block must
              not change height. The trust lines and every message share this one grid cell, which
              is as tall as the tallest, and only one shows: the error lands right by the button. */}
          <div className={styles.stage}>
            <div
              className={`${styles.trust} ${styles.rise}`}
              style={place(4)}
              data-hidden={!!problem}
              aria-hidden={!!problem}
              inert={!!problem}
            >
              <p>{t.scope}</p>
              <p>
                <a className={styles.link} href="https://github.com/join">
                  {t.join}
                </a>
              </p>
            </div>
            {/* Focus moving to the message reads its title and text, then Try again is next. It
                has no alert role: some screen readers would read a focused alert twice. */}
            {(Object.keys(t.problems) as ProblemKey[]).map((key) => {
              const active = key === problem;
              const id = `${messageId}-${key}`;
              return (
                <div
                  className={styles.message}
                  data-active={active}
                  key={key}
                  role="group"
                  aria-labelledby={`${id}-title`}
                  aria-describedby={`${id}-text`}
                  tabIndex={active ? -1 : undefined}
                  ref={active ? messageRef : undefined}
                  aria-hidden={!active}
                  inert={!active}
                >
                  <span className={styles.tile}>
                    <AlertIcon />
                  </span>
                  <div>
                    <p className={styles.messageTitle} id={`${id}-title`}>
                      {t.problems[key].title}
                    </p>
                    <p className={styles.messageText} id={`${id}-text`}>
                      {t.problems[key].text}
                    </p>
                    <button type="button" className={styles.retry} onClick={start}>
                      {t.retry}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </GatherHero>
      </main>
    </div>
  );
}
