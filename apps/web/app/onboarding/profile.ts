import { useEffect, useState } from "react";

import { SignedOutError, apiFetch } from "../session/session";
import type { Profile } from "./options";

// When GitHub has no name, the API stores the username as the name: show it once, not twice.
export async function loadProfile(): Promise<Profile> {
  const response = await apiFetch("/v1/me");
  const me = (await response.json().catch(() => null))?.data;
  if (!response.ok || typeof me?.username !== "string") throw new Error(`GET /v1/me answered ${response.status}`);
  const name = typeof me.display_name === "string" && me.display_name !== me.username ? me.display_name : null;
  return { displayName: name, username: me.username };
}

// The signed-in developer, or null while loading. A failure is thrown during render, so the
// onboarding error page offers Try again. A refused session needs nothing here: it is
// forgotten, and RequireSession sends the person to sign-in.
export function useProfile(): Profile | null {
  const [result, setResult] = useState<Profile | Error | null>(null);
  useEffect(() => {
    let live = true;
    loadProfile().then(
      (profile) => live && setResult(profile),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setResult(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, []);
  if (result instanceof Error) throw result;
  return result;
}
