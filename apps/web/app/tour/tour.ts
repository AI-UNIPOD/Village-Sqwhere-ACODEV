import { useSyncExternalStore } from "react";

import { loadQuestions } from "../feed/feed-api";
import { loadHubsByIdea } from "../hubs/hubs-api";
import { loadMyIdeas } from "../ideas/ideas-api";

// The guided tour: a route of six steps through the demo account's own screens, from its village
// and feed to one idea and its hub. The state is kept in sessionStorage, so a reload or the
// language link (a full page load) keeps the step, and a sign-out clears it with the rest.

export const STEPS = 6;

// A conversation is worth showing when it has a few comments to read.
const COMMENTS_WORTH_READING = 3;

/**
 * What the steps after the feed are on: one question with its comments, and the demo's open
 * idea with the hub it owns for that idea. Ids, not seeded names: the feed holds hundreds of posts.
 */
export type Route = { post: string; idea: string; hub: string };

/** `step` 0 to 5 is the first to the sixth step. `route` is null until the API has been asked. */
export type Tour = { step: number; route: Route | null };

type Snapshot = { tour: Tour | null; /** a step was just chosen and its screen is on its way */ arriving: boolean };

const KEY = "vs_tour";

function read(): Tour | null {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    const { step, route } = kept ?? {};
    const known = route === null || ["post", "idea", "hub"].every((id) => typeof route?.[id] === "string");
    if (Number.isInteger(step) && step >= 0 && step < STEPS && known) return { step, route };
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

// The person chose a step: its screen is on its way, and when it shows it takes focus.
export function chooseStep(step: number) {
  const { tour } = snapshot();
  if (tour) change({ ...tour, step }, true);
}

// The screen of the step is showing and has taken focus.
export function arrived() {
  const { tour, arriving } = snapshot();
  if (arriving) change(tour);
}

/** The screen of a step, as the frame names it, with a hash if the screen scrolls to a part. */
export function stepAddress(step: number, route: Route | null) {
  if (!route || step === 0) return "village";
  const [post, idea, hub] = [route.post, route.idea, route.hub].map(encodeURIComponent);
  // the sixth step is the hub page at its team: the agreement and the four phases are below it
  return ["village", "feed", `posts/view?id=${post}`, `ideas/compose?id=${idea}`, `ideas/matches?id=${idea}`, `hubs/view?id=${hub}#team`][step];
}

/** The same without the hash: what the frame's `path` is when the person is on the step. */
export const stepPath = (step: number, route: Route | null) => stepAddress(step, route).split("#")[0];

// Looks for the route in the demo account's own ideas and hubs, and in the feed's questions: the
// first with a few comments, else the first. Null when it has no question, or no open idea with
// a hub it owns.
export async function loadRoute(): Promise<Route | null> {
  const [{ data: ideas }, hubs, { data: questions }] = await Promise.all([loadMyIdeas(), loadHubsByIdea(), loadQuestions()]);
  const post = questions.find((question) => question.comment_count >= COMMENTS_WORTH_READING) ?? questions[0];
  for (const idea of ideas) {
    const hub = idea.status === "open" ? hubs[idea.id] : undefined;
    if (post && hub?.viewer.member_role === "owner") return { post: post.id, idea: idea.id, hub: hub.id };
  }
  return null;
}
