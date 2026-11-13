import { useEffect, useState } from "react";

import { SignedOutError, apiFetch } from "../session/session";
import type { Answers } from "./steps";

const send = (method: string, path: string, body: unknown) =>
  apiFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Saves the main role, then the stack, then the technologies the feed should show. Each call is
// safe to send again, which is what makes "Try again" safe: a role the developer already has is
// only made the main one. The country and the sectors have nowhere to go yet. Throws when any
// call fails. Only call it with a role.
export async function saveAnswers(answers: Answers): Promise<void> {
  const claimed = await send("POST", "/v1/me/roles", { role: answers.role, is_primary: true });
  if (claimed.status === 409 && (await claimed.json().catch(() => null))?.detail?.code === "ROLE_ALREADY_CLAIMED") {
    const promoted = await send("PATCH", `/v1/me/roles/${answers.role}`, { is_primary: true });
    if (!promoted.ok) throw new Error(`PATCH /v1/me/roles answered ${promoted.status}`);
  } else if (!claimed.ok) {
    throw new Error(`POST /v1/me/roles answered ${claimed.status}`);
  }
  const stack = await send("PUT", "/v1/me/technologies", { technologies: answers.stack });
  if (!stack.ok) throw new Error(`PUT /v1/me/technologies answered ${stack.status}`);
  // the API calls a feed topic a technology; an empty list means "show every post"
  const feed = await send("PUT", "/v1/me/feed-topics", { technologies: answers.feed });
  if (!feed.ok) throw new Error(`PUT /v1/me/feed-topics answered ${feed.status}`);
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

type Outcome = "saved" | "failed";

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
        if (live && !(error instanceof SignedOutError)) setOutcome("failed");
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
