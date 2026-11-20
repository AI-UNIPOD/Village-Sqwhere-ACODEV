import { useMemo, useSyncExternalStore } from "react";

import type { Lang } from "../locales";
import { noticeDemoRefusal } from "./demo";

// The session lives in localStorage so it survives a reload and is shared between tabs. The
// trade-off is that any script on this origin can read it, so the site must stay free of
// third-party scripts. See docs/decisions/2026-11-11-web-session-in-local-storage.md.
export const SESSION_KEY = "vs_session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Only the tokens are kept, never the profile: pages ask the API for it (GET /v1/me).
export type Session = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string;
};

// What POST /v1/auth/token answers with, in `data`.
type TokenData = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_at: string;
};

export function isTokenData(data: unknown): data is TokenData {
  const d = data as TokenData | null;
  return (
    typeof d?.access_token === "string" &&
    typeof d.refresh_token === "string" &&
    typeof d.expires_in === "number" &&
    typeof d.refresh_expires_at === "string"
  );
}

// Same-tab writes do not fire "storage", so this event tells the hooks in this tab.
const CHANGED = "vs-session-change";

function announce() {
  window.dispatchEvent(new Event(CHANGED));
}

export function saveSession(data: TokenData): Session {
  const session: Session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    refresh_expires_at: data.refresh_expires_at,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  announce();
  return session;
}

// A session counts until its refresh token expires. Anything unreadable counts as none.
export function parseSession(raw: string | null, now = Date.now()): Session | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    const ok =
      typeof s.access_token === "string" &&
      typeof s.refresh_token === "string" &&
      typeof s.expires_at === "string" &&
      Date.parse(s.refresh_expires_at) > now;
    return ok ? s : null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

// undefined while the page is prerendered or hydrating (the server cannot see localStorage),
// then the session or null. Pages wait for a definite answer before redirecting anyone.
export function useSession(): Session | null | undefined {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, readRaw, () => undefined);
  return useMemo(() => (raw === undefined ? undefined : parseSession(raw)), [raw]);
}

// The session is over: the refresh token was refused, or there is none.
export class SignedOutError extends Error {}

function forget() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked: there is nothing stored to forget
  }
  announce();
}

// Two tabs refreshing the same token must take turns: the API rotates it, so the second would
// be refused as revoked while the first tab's new pair is still on its way to storage.
async function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request("village-sqwhere-refresh", work) : work();
}

// Trades the refresh token for a new pair. The API rotates it, so the old one stops working.
function exchangeRefresh(refreshToken: string): Promise<Session> {
  return withRefreshLock(async () => {
    // another tab refreshed while this one waited for its turn: take its pair
    const waited = parseSession(readRaw());
    if (waited && waited.refresh_token !== refreshToken) return waited;
    return exchange(refreshToken);
  });
}

async function exchange(refreshToken: string): Promise<Session> {
  const response = await fetch(`${API_URL}/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (response.status === 401) {
    // Another tab may have rotated it already: its new pair is still good.
    const stored = parseSession(readRaw());
    if (stored && stored.refresh_token !== refreshToken) return stored;
    forget();
    throw new SignedOutError();
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !isTokenData(body?.data)) throw new Error(`refresh failed: ${response.status}`);
  return saveSession(body.data);
}

// Calls made together share one refresh: a second refresh of the same token would be refused
// as revoked and sign the person out.
let pending: { token: string; result: Promise<Session> } | null = null;

function refresh(session: Session): Promise<Session> {
  if (pending?.token !== session.refresh_token) {
    const result = exchangeRefresh(session.refresh_token).finally(() => {
      if (pending?.result === result) pending = null;
    });
    pending = { token: session.refresh_token, result };
  }
  return pending.result;
}

// The stored session, with an access token about to expire (they last 15 minutes) refreshed
// first. Throws SignedOutError when there is none or it cannot be renewed.
async function currentSession(): Promise<Session> {
  const session = parseSession(readRaw());
  if (!session) throw new SignedOutError();
  return Date.parse(session.expires_at) - 30_000 < Date.now() ? refresh(session) : session;
}

// Calls the API as the signed-in person. A 401 gets one refresh and one retry. Throws
// SignedOutError when the session cannot be saved, and lets network errors through.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await currentSession();
  const send = (s: Session) =>
    fetch(`${API_URL}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${s.access_token}` } });
  let response = await send(session);
  if (response.status === 401) response = await send(await refresh(session));
  await noticeDemoRefusal(response);
  return response;
}

// Forgets the session here first, so signing out works even when the API cannot be reached,
// asks the API to revoke the refresh token (keepalive lets the request outlive the page), and
// goes home. This tab's hooks are not told: a guarded page would send the person to sign-in
// first. Other tabs still hear it through the storage event. `to` is the page to open
// instead of the home page, after the language ("/sign-in").
export function signOut(lang: Lang, to = "") {
  const session = parseSession(readRaw());
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage blocked: there is nothing stored to forget
  }
  try {
    // the tab's onboarding answers belong to this person, not the next one to sign in
    sessionStorage.clear();
  } catch {
    // storage blocked: there is nothing stored to forget
  }
  if (session) {
    fetch(`${API_URL}/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
      keepalive: true,
    }).catch(() => {});
  }
  // a full load, so nothing from the signed-in page stays in memory
  window.location.replace(`/${lang}${to}`);
}
