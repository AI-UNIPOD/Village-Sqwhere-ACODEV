import { useEffect, useState } from "react";

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
  roles: MeRole[];
  technologies: { slug: string; name: string }[];
};

export async function loadMe(): Promise<Me> {
  const response = await apiFetch("/v1/me");
  const me = (await response.json().catch(() => null))?.data;
  if (!response.ok || typeof me?.username !== "string") throw new Error(`GET /v1/me answered ${response.status}`);
  return me;
}

// The signed-in developer, or null while loading. A failure is thrown during render, so the
// page's error screen offers Try again. A refused session needs nothing here: it is
// forgotten, and RequireSession sends the person to sign-in.
export function useMe(): Me | null {
  const [result, setResult] = useState<Me | Error | null>(null);
  useEffect(() => {
    let live = true;
    loadMe().then(
      (me) => live && setResult(me),
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
