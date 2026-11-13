import { useCallback, useEffect, useState } from "react";

import { loadMe, useMe, type Me } from "../session/me";
import { SignedOutError, apiFetch } from "../session/session";

export type AttemptStatus = "pending" | "in_progress" | "awaiting_review" | "passed" | "failed" | "abandoned";

// One verification attempt as the API answers it. Only the fields the page reads are listed.
export type Attempt = {
  id: string;
  attempt_number: number;
  status: AttemptStatus;
  current_phase: "codebase_analysis" | "technical_defence" | "report_generation" | null;
  last_error: string | null;
  evidence: { repository_url: string }[];
  reviewer_notes: string | null;
  started_at: string | null;
  created_at: string;
};

export type Finished = Attempt & { status: "passed" | "failed" | "abandoned" };

export const isActive = (attempt: Attempt) => ["pending", "in_progress", "awaiting_review"].includes(attempt.status);
export const isFinished = (attempt: Attempt): attempt is Finished => !isActive(attempt);

const POLL_MS = 5000;

// While our AI is working the page asks again. A person's turn (the interview, the review) is
// not polled: nothing changes until they act, and a visit to the tab refetches once.
const aiIsWorking = ({ status, current_phase }: Attempt) =>
  status === "pending" || (status === "in_progress" && (current_phase === "codebase_analysis" || current_phase === "report_generation"));

// The error code of an API answer, or "" when it has none.
export async function errorCode(response: Response): Promise<string> {
  return (await response.json().catch(() => null))?.detail?.code ?? "";
}

export type Actions = ReturnType<typeof useVerification>["actions"];

// The signed-in developer, their main role and that role's attempts, kept fresh: an active
// attempt is refetched while the AI works on it and when the tab comes back into view.
export function useVerification() {
  const loaded = useMe();
  const [fresh, setFresh] = useState<Me | null>(null);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [, setFailure] = useState<unknown>(null);
  const me = fresh ?? loaded;
  const role = me?.roles.find((r) => r.is_primary) ?? me?.roles[0];
  // A verified role has nothing left to load.
  const slug = role && !role.verified_at ? role.slug : undefined;

  // A failure is thrown during render, so the page's error screen offers Try again. A refused
  // session needs nothing: RequireSession sends the person to sign-in.
  const fail = useCallback((error: unknown) => {
    if (!(error instanceof SignedOutError)) {
      setFailure(() => {
        throw error;
      });
    }
  }, []);

  const refreshMe = useCallback(() => {
    loadMe().then(setFresh, fail);
  }, [fail]);

  const loadAttempts = useCallback(() => {
    if (!slug) return;
    apiFetch(`/v1/me/verifications?role_slug=${encodeURIComponent(slug)}`)
      .then(async (response) => {
        const list = (await response.json().catch(() => null))?.data;
        if (!response.ok || !Array.isArray(list)) throw new Error(`GET /v1/me/verifications answered ${response.status}`);
        setAttempts(list);
      })
      .catch(fail);
  }, [slug, fail]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  // Puts an attempt into the list: replaces the one with its id, or adds it as the newest.
  const upsert = useCallback((attempt: Attempt) => {
    setAttempts((list) =>
      list?.some((a) => a.id === attempt.id) ? list.map((a) => (a.id === attempt.id ? attempt : a)) : [attempt, ...(list ?? [])],
    );
  }, []);

  const refreshAttempt = useCallback(
    async (id: string) => {
      try {
        const response = await apiFetch(`/v1/me/verifications/${id}`);
        const attempt: Attempt | undefined = (await response.json())?.data;
        if (!response.ok || !attempt) return;
        upsert(attempt);
        // passed shows the verified state; failed and stopped change the attempts left
        if (!isActive(attempt)) refreshMe();
      } catch {
        // a dropped connection: the next tick or the next visit asks again
      }
    },
    [upsert, refreshMe],
  );

  const active = attempts?.find(isActive);
  const activeId = active?.id;
  const polling = !!active && aiIsWorking(active);
  useEffect(() => {
    if (!activeId) return;
    const check = () => {
      if (!document.hidden) void refreshAttempt(activeId);
    };
    const timer = polling ? setInterval(check, POLL_MS) : undefined;
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [activeId, polling, refreshAttempt]);

  const actions = {
    // an attempt the person just started or stopped
    accept: (attempt: Attempt) => {
      upsert(attempt);
      refreshMe();
    },
    // the page was behind the server: ask for both again
    reload: () => {
      refreshMe();
      loadAttempts();
    },
    refreshMe,
  };

  return { me, role, slug, attempts, actions };
}
