"use client";

import { useEffect, useRef, useState } from "react";

import { isDemoRefusal, notSaved } from "../demo-refusal";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { loadHub, withdrawRequest, type Hub } from "./hubs-api";

/** How a press on "Withdraw my request" ended: it was taken back, or the owner had answered first. */
export type WithdrawOutcome = "withdrawn" | "answered";

// A developer takes back a request the owner has not answered. It asks for no confirmation:
// nothing is lost, and they can ask again at once. `onDone` gets the hub's card as it is now.
export function WithdrawRequest({ lang, hubId, onDone }: { lang: Lang; hubId: string; onDone: (hub: Hub, outcome: WithdrawOutcome) => void }) {
  const t = copy[lang];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<boolean | "demo">(false);

  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onDone(await withdrawRequest(hubId), "withdrawn");
    } catch (error) {
      if (error instanceof SignedOutError) return;
      try {
        // nothing was waiting: the owner answered first, so show where the developer stands now
        if (!(error instanceof IdeaError) || error.code !== "REQUEST_NOT_FOUND") throw error;
        onDone(await loadHub(hubId), "answered");
      } catch (again) {
        if (again instanceof SignedOutError) return;
        setFailed(isDemoRefusal(again) ? "demo" : true);
        setBusy(false);
      }
    }
  };

  return (
    <>
      {failed && (
        <p className={`${onboarding.error} ${ideas.act}`} role="alert">
          <AlertCircle />
          {failed === "demo" ? notSaved(lang) : t.team.actionFailed}
        </p>
      )}
      <button type="button" className={`${landing.ghost} ${ideas.act}`} aria-busy={busy || undefined} onClick={withdraw}>
        {t.ask.withdraw}
      </button>
    </>
  );
}

// What became of the request, said where the button was. The button is gone, so this line takes
// the person's place and a screen reader hears it.
export function WithdrawnLine({ lang, outcome }: { lang: Lang; outcome: WithdrawOutcome }) {
  const line = useRef<HTMLParagraphElement>(null);
  useEffect(() => line.current?.focus(), []);
  return (
    <p ref={line} tabIndex={-1} role="status" className={ideas.lead}>
      {copy[lang].ask[outcome]}
    </p>
  );
}
