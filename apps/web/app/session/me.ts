import { useEffect, useState, useSyncExternalStore } from "react";

import { SignedOutError, apiFetch } from "./session";

// The signed-in developer as GET /v1/me answers, in the API's own shape. Only the fields the
// web app reads are listed.
export type MeRole = {
  slug: string;
  name: string;
  is_primary: boolean;
  verified_at: string | null;
  verification: { attempts_used: number; attempts_remaining: number; latest_status: string | null };
};

export type Me = {
  username: string;
  display_name: string;
  bio: string | null;
  roles: MeRole[];
  technologies: { slug: string; name: string }[];
};

// The last profile the API answered with, kept for the visit. Every screen asks for the
// profile, so without this each one would open on a loading skeleton. A sign-in or a sign-out
// loads a whole new page, which empties it.
let kept: Me | null = null;
const listeners = new Set<() => void>();

function keep(me: Me | null) {
  kept = me;
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

// Keeps a profile the API answered a change with, so every screen showing it updates.
export function keepMe(me: Me) {
  keep(me);
}

// Forgets the kept profile, for tests and for anything that changes who is signed in.
export function forgetMe() {
  keep(null);
}

// Asks the API for the profile and keeps the answer, so every screen showing it updates.
export async function loadMe(): Promise<Me> {
  const response = await apiFetch("/v1/me");
  const me = (await response.json().catch(() => null))?.data;
  if (!response.ok || typeof me?.username !== "string") throw new Error(`GET /v1/me answered ${response.status}`);
  keep(me);
  return me;
}

// The profile if a screen has already loaded it this visit, without asking the API.
export function useKeptMe(): Me | null {
  return useSyncExternalStore(
    subscribe,
    () => kept,
    () => null,
  );
}

// The signed-in developer, or null while loading. A screen opened later in the visit gets the
// kept profile at once and a fresh one moments after. A failure with nothing to show is thrown
// during render, so the page's error screen offers Try again; with a kept profile on screen it
// is let go. A refused session needs nothing here: it is forgotten, and RequireSession sends
// the person to sign-in.
export function useMe(): Me | null {
  const me = useKeptMe();
  const [failure, setFailure] = useState<Error | null>(null);
  useEffect(() => {
    let live = true;
    loadMe().catch((error: unknown) => {
      if (live && !kept && !(error instanceof SignedOutError)) setFailure(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      live = false;
    };
  }, []);
  if (failure) throw failure;
  return me;
}
