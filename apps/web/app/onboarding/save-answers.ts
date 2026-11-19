import { useEffect, useState } from "react";

import { isDemoRefusal } from "../demo-refusal";
import { IdeaError, call } from "../ideas/ideas-api";
import { SignedOutError } from "../session/session";
import { ALPHA2 } from "./options";
import type { Answers } from "./steps";

// Saves the main role, then the stack, then the technologies the feed should show, then the
// sectors, then the country if one was chosen. Each call is safe to send again, which is what
// makes "Try again" safe: a role the developer already has is only made the main one, and the
// same country is set again. A skipped country sends nothing, so it never clears one already
// on the profile. Throws when any call fails, with the API's code, so the done step can tell
// the demo's refusal from a failure. Only call it with a role.
export async function saveAnswers(answers: Answers): Promise<void> {
  try {
    await call("/v1/me/roles", "POST", { role: answers.role, is_primary: true });
  } catch (error) {
    if (!(error instanceof IdeaError && error.status === 409 && error.code === "ROLE_ALREADY_CLAIMED")) throw error;
    await call(`/v1/me/roles/${answers.role}`, "PATCH", { is_primary: true });
  }
  await call("/v1/me/technologies", "PUT", { technologies: answers.stack });
  // the API calls a feed topic a technology; an empty list means "show every post"
  await call("/v1/me/feed-topics", "PUT", { technologies: answers.feed });
  // the answers call them topics, from before the API had a name for them
  await call("/v1/me/sectors", "PUT", { sectors: answers.topics });
  // the answer is kept under the three-letter code, the API wants two letters
  if (answers.country) await call("/v1/me", "PATCH", { country_code: ALPHA2[answers.country] });
}

// Saves started together share one run. React mounts twice in development, and two stack
// replacements sent at the same moment make the API fail one of them.
let pending: { key: string; result: Promise<void> } | null = null;

function saveOnce(answers: Answers): Promise<void> {
  const key = JSON.stringify(answers);
  if (pending?.key !== key) {
    const result = saveAnswers(answers).finally(() => {
      if (pending?.result === result) pending = null;
    });
    pending = { key, result };
  }
  return pending.result;
}

// "demo" is the demo account, whose answers the API never saves.
type Outcome = "saved" | "failed" | "demo";

// Saves when the done step opens, and again on retry. With no role (the person skipped) there
// is nothing to save. A refused session needs nothing here: RequireSession sends the person
// to sign-in.
export function useSavedProfile(answers: Answers) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (answers.role === null) return;
    let live = true;
    saveOnce(answers).then(
      () => live && setOutcome("saved"),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setOutcome(isDemoRefusal(error) ? "demo" : "failed");
      },
    );
    return () => {
      live = false;
    };
  }, [answers, attempt]);
  const status = answers.role === null ? "idle" : (outcome ?? "saving");
  const retry = () => {
    setOutcome(null);
    setAttempt((n) => n + 1);
  };
  return { status, retry };
}
