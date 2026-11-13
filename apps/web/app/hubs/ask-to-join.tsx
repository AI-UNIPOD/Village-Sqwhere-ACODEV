"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { LoadFailed } from "./form-parts";
import { askToJoin, loadHub, type Hub } from "./hubs-api";

// A refusal that means the developer already has a place in the hub: the page shows that place.
const ALREADY: Record<string, string> = { ALREADY_MEMBER: "active", ALREADY_INVITED: "invited", ALREADY_REQUESTED: "requested" };

// The step the developer can take towards an idea's hub: ask the owner to let them in, or the
// next step of a request they already made. The hub card says where they stand, so the answer
// is the same on every visit.
export function AskToJoin({ lang, hubId }: { lang: Lang; hubId: string | null }) {
  const t = copy[lang];
  const [hub, setHub] = useState<Hub | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  // only a request made on this page arrives with motion, never one found on load
  const [justAsked, setJustAsked] = useState(false);
  // the owner turned the last request down and the developer must wait: until when, or "later"
  // when the API's date cannot be read
  const [wait, setWait] = useState<Date | "later" | null>(null);
  const note = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!hubId) return;
    let live = true;
    loadHub(hubId).then(
      (found) => live && setHub(found),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [hubId, attempt]);

  // the button that was pressed is gone: keep the person's place on what replaced it
  useEffect(() => {
    if (justAsked || wait) note.current?.focus();
  }, [justAsked, wait]);

  if (!hubId) return <p className={ideas.lead}>{t.ask.noHub}</p>;
  if (failed) {
    return (
      <LoadFailed
        text={t.ask.loadFailed}
        retry={t.retry}
        onRetry={() => {
          setFailed(false);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!hub) {
    return (
      <div className={onboarding.skeleton} aria-busy="true" aria-hidden="true">
        <div className={onboarding.block} />
      </div>
    );
  }

  const place = (membership: string) => setHub({ ...hub, viewer: { ...hub.viewer, membership_status: membership } });

  const ask = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setHub(await askToJoin(hubId));
      setJustAsked(true);
    } catch (error) {
      if (error instanceof SignedOutError) return;
      const code = error instanceof IdeaError ? error.code : "";
      if (ALREADY[code]) place(ALREADY[code]);
      else if (code === "IDEA_CLOSED") setClosed(true);
      else if (code === "HUB_ARCHIVED") setHub({ ...hub, status: "archived" });
      else if (code === "REQUEST_COOLING_DOWN") {
        const until = new Date(String((error as IdeaError).detail?.can_ask_again_at));
        setWait(Number.isNaN(until.getTime()) ? "later" : until);
      }
      else setProblem(code === "TEAM_FULL" ? t.team.full : t.team.actionFailed);
    } finally {
      setBusy(false);
    }
  };

  const status = hub.viewer.membership_status;
  if (status === "active") {
    return (
      <>
        <p className={ideas.lead}>{t.ask.member}</p>
        <Link className={`${landing.btn} ${ideas.act}`} href={`/${lang}/hubs/view?id=${encodeURIComponent(hub.id)}`}>
          {t.openHub}
        </Link>
      </>
    );
  }
  if (status === "invited") {
    return (
      <>
        <p className={ideas.lead}>{t.invitation.title}</p>
        <Link className={`${landing.btn} ${ideas.act}`} href={`/${lang}/hubs/join?id=${encodeURIComponent(hub.id)}`}>
          {t.invitation.sign}
        </Link>
      </>
    );
  }
  if (status === "requested") {
    return (
      <div role="status">
        {justAsked ? (
          <p ref={note} tabIndex={-1} className={ideas.done}>
            <Check />
            {t.ask.asked}
          </p>
        ) : (
          <p className={ideas.lead}>{t.ask.asked}</p>
        )}
      </div>
    );
  }
  if (closed) return <p className={ideas.lead}>{t.ask.closed}</p>;
  if (wait) {
    // the button would only be refused again, so the date takes its place
    return (
      <div role="status">
        <p ref={note} tabIndex={-1} className={ideas.lead}>
          {wait === "later" ? t.ask.waitLater : fill(t.ask.wait, { date: wait.toLocaleString(lang, { dateStyle: "long", timeStyle: "short" }) })}
        </p>
      </div>
    );
  }
  if (hub.status === "archived") return <p className={ideas.lead}>{t.join.archived.title}</p>;
  return (
    <>
      <p className={ideas.lead}>{t.ask.what}</p>
      {problem && (
        <p className={`${onboarding.error} ${ideas.act}`} role="alert">
          <AlertCircle />
          {problem}
        </p>
      )}
      <button type="button" className={`${landing.btn} ${ideas.act}`} aria-busy={busy || undefined} onClick={ask}>
        {t.ask.button}
      </button>
    </>
  );
}
