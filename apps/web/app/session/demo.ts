import { useSyncExternalStore } from "react";

import { API_URL, isTokenData, saveSession } from "./session";

// The demo: one shared account anyone can open without GitHub. It can look at everything and
// change nothing: the API answers every change with 403 DEMO_READ_ONLY.

// How opening the demo is going, shared by every "Try the demo" button on a page and the line
// that reports on them.
export type DemoOpening = "idle" | "opening" | "unavailable" | "network" | "failed";

let opening: DemoOpening = "idle";
// How many changes the API has refused in this visit: the frame's demo line says so each time.
let refused = 0;
const listeners = new Set<() => void>();

function tell() {
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export const useDemoOpening = () => useSyncExternalStore(subscribe, () => opening, () => "idle" as DemoOpening);

export const useDemoRefusals = () => useSyncExternalStore(subscribe, () => refused, () => 0);

/** For tests: a fresh visit. */
export function resetDemo() {
  opening = "idle";
  refused = 0;
  tell();
}

// Signs in as the demo account and keeps the session, as the return from GitHub does. Answers
// true when the session is kept. A second press while one is on its way does nothing.
export async function openDemo(): Promise<boolean> {
  if (opening === "opening") return false;
  opening = "opening";
  tell();
  let outcome: DemoOpening = "idle";
  try {
    const response = await fetch(`${API_URL}/v1/auth/demo`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (response.ok && isTokenData(body?.data)) saveSession(body.data);
    // switched off, or its account is not in this database
    else outcome = response.status === 404 ? "unavailable" : "failed";
  } catch {
    outcome = "network";
  }
  opening = outcome;
  tell();
  return outcome === "idle";
}

// Called for every answer the API gives a signed-in request. A change the demo account tried
// is refused in one way, so it is noticed here once for every screen. The answer is read from
// a copy, so the screen that asked can still read it.
export async function noticeDemoRefusal(response: Response): Promise<void> {
  if (response.status !== 403) return;
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  if (body?.detail?.code !== "DEMO_READ_ONLY") return;
  refused += 1;
  tell();
}
