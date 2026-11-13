import type { Lang } from "../locales";

export const QUESTIONS = ["role", "stack", "country", "topics", "feed"] as const;
export type Question = (typeof QUESTIONS)[number];
export type StepId = "welcome" | Question | "done";
export const STEP_IDS: readonly StepId[] = ["welcome", ...QUESTIONS, "done"];

export type Answers = {
  role: string | null;
  stack: string[];
  country: string | null;
  topics: string[];
  /** The technologies the developer wants posts about. None means every post. */
  feed: string[];
};

export const NO_ANSWERS: Answers = { role: null, stack: [], country: null, topics: [], feed: [] };

export function parseStep(value: string | null): StepId {
  return STEP_IDS.find((id) => id === value) ?? "welcome";
}

export function isQuestion(step: StepId): step is Question {
  return (QUESTIONS as readonly string[]).includes(step);
}

// Only the role and the stack must be answered. The country, the sectors and the feed's
// technologies can be skipped.
export const REQUIRED: readonly Question[] = ["role", "stack"];

export function isAnswered(step: Question, answers: Answers) {
  if (step === "role") return answers.role !== null;
  if (step === "stack") return answers.stack.length > 0;
  return true;
}

// A link to a later step goes back to the first required question that is still open. A reload
// keeps its step because the saved answers are restored first. The done page needs nothing:
// "Skip for now" leads straight to it.
export function reachable(step: StepId, answers: Answers): StepId {
  const before = isQuestion(step) ? QUESTIONS.slice(0, QUESTIONS.indexOf(step)) : [];
  return before.find((question) => !isAnswered(question, answers)) ?? step;
}

export function stepHref(lang: Lang, step: StepId) {
  return `/${lang}/onboarding${step === "welcome" ? "" : `?step=${step}`}`;
}
