import { useMemo, useState, useSyncExternalStore } from "react";

import { ROLES, TECHNOLOGIES, TOPICS, countriesFor } from "./options";
import { NO_ANSWERS, type Answers } from "./steps";

// The answers live in sessionStorage, so a reload or a dropped tab does not ask for them
// again (WCAG 3.3.7). They go with the tab. Storage can be blocked, so every call is guarded.
export const ANSWERS_KEY = "vs_onboarding_answers";

const knownRoles = ROLES.map((role) => role.slug);
const knownTechnologies = TECHNOLOGIES.map((tech) => tech.slug);
const knownTopics = TOPICS.map((topic) => topic.slug);
const knownCountries = countriesFor("en").map((country) => country.code);

const one = (value: unknown, known: string[]) =>
  typeof value === "string" && known.includes(value) ? value : null;

const many = (value: unknown, known: string[]) =>
  Array.isArray(value) ? known.filter((slug) => value.includes(slug)) : [];

// What is stored is untrusted: a stale format, an edit, another build. Anything unknown or
// misshapen is dropped, field by field.
export function parseAnswers(raw: string | null): Answers {
  let stored: unknown;
  try {
    stored = JSON.parse(raw ?? "");
  } catch {
    return NO_ANSWERS;
  }
  if (typeof stored !== "object" || stored === null) return NO_ANSWERS;
  const saved = stored as Record<string, unknown>;
  return {
    role: one(saved.role, knownRoles),
    stack: many(saved.stack, knownTechnologies),
    country: one(saved.country, knownCountries),
    topics: many(saved.topics, knownTopics),
  };
}

function readStored(): string | null {
  try {
    return sessionStorage.getItem(ANSWERS_KEY);
  } catch {
    return null;
  }
}

function saveAnswers(answers: Answers) {
  try {
    sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
  } catch {
    // Private mode or blocked storage: the answers stay in the page only, as before.
  }
}

// Nothing in storage changes under the page, so there is nothing to subscribe to.
const never = () => () => {};

// The answers, restored from the tab's storage and saved on every change. useSyncExternalStore
// gives the empty answers while the server HTML hydrates and the saved ones right after, so
// the first render never differs from the server. `ready` says which of the two this is.
export function useSavedAnswers() {
  const ready = useSyncExternalStore(never, () => true, () => false);
  const stored = useSyncExternalStore(never, readStored, () => null);
  const restored = useMemo(() => parseAnswers(stored), [stored]);
  const [edited, setEdited] = useState<Answers | null>(null);

  function change(next: Answers) {
    setEdited(next);
    saveAnswers(next);
  }

  return { answers: edited ?? restored, ready, change };
}
