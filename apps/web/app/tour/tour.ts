import { useSyncExternalStore } from "react";

import { loadHubsByIdea } from "../hubs/hubs-api";
import { loadMyIdeas } from "../ideas/ideas-api";

// The guided tour: a route of four stops through the demo account's own screens, followed on
// one idea from its start to its hub. The state is kept in sessionStorage, so a reload or the
// language link (a full page load) keeps the stop, and a sign-out clears it with the rest.

export const STOPS = 4;

/** The demo's open idea and the hub it owns for that idea, which every stop is on. */
export type Route = { idea: string; hub: string };

/** `step` 0 is the start, 1 to 4 the stops. `route` is null until the API has been asked. */
export type Tour = { step: number; route: Route | null };

type Snapshot = { tour: Tour | null; /** a stop was just chosen and its screen is on its way */ arriving: boolean };

const KEY = "vs_tour";

function read(): Tour | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    const { step, route } = kept ?? {};
    const known = route === null || (typeof route?.idea === "string" && typeof route?.hub === "string");
    if (Number.isInteger(step) && step >= 0 && step <= STOPS && known) return { step, route };
  } catch {
    // storage blocked, or something else wrote the key: there is no tour to continue
  }
  return null;
}

function write(tour: Tour | null) {
  try {
    if (tour) sessionStorage.setItem(KEY, JSON.stringify(tour));
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: the tour lasts as long as this page
  }
}

let current: Snapshot | null = null;
const listeners = new Set<() => void>();

function snapshot(): Snapshot {
  return (current ??= { tour: read(), arriving: false });
}

function change(tour: Tour | null, arriving = false) {
  write(tour);
  current = { tour, arriving };
  listeners.forEach((notify) => notify());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

// Nothing is on the server: the tour belongs to this tab.
const none: Snapshot = { tour: null, arriving: false };

export const useTour = () => useSyncExternalStore(subscribe, snapshot, () => none);

export const startTour = () => change({ step: 0, route: null });

export const endTour = () => change(null);

export function keepRoute(route: Route) {
  const { tour, arriving } = snapshot();
  if (tour) change({ ...tour, route }, arriving);
}

// The person chose a stop: its screen is on its way, and when it shows it takes focus.
export function chooseStop(step: number) {
  const { tour } = snapshot();
  if (tour) change({ ...tour, step }, true);
}

// The screen of the stop is showing and has taken focus.
export function arrived() {
  const { tour, arriving } = snapshot();
  if (arriving) change(tour);
}

/** The screen of a stop, as the frame names it, with a hash if the screen scrolls to a part. */
export function stopAddress(step: number, route: Route | null) {
  if (!route || step === 0) return "village";
  const idea = encodeURIComponent(route.idea);
  const hub = encodeURIComponent(route.hub);
  return [`ideas/compose?id=${idea}`, `ideas/matches?id=${idea}`, `hubs/view?id=${hub}`, `hubs/view?id=${hub}#phases`][step - 1];
}

/** The same without the hash: what the frame's `path` is when the person is on the stop. */
export const stopPath = (step: number, route: Route | null) => stopAddress(step, route).split("#")[0];

// Looks for the route in the demo account's own ideas and hubs. Null when it has no open idea
// with a hub it owns.
export async function loadRoute(): Promise<Route | null> {
  const [{ data: ideas }, hubs] = await Promise.all([loadMyIdeas(), loadHubsByIdea()]);
  for (const idea of ideas) {
    const hub = idea.status === "open" ? hubs[idea.id] : undefined;
    if (hub?.viewer.member_role === "owner") return { idea: idea.id, hub: hub.id };
  }
  return null;
}
