import styles from "./demo-refusal.module.css";
import { IdeaError } from "./ideas/ideas-api";
import type { Lang } from "./locales";

// The code the API refuses every change of the demo account with, whatever the control was.
export const DEMO_READ_ONLY = "DEMO_READ_ONLY";

export const isDemoRefusal = (error: unknown) => error instanceof IdeaError && error.code === DEMO_READ_ONLY;

// What a screen keeps for a change that did not go through: "demo" when the demo account's
// change was refused, otherwise the screen's own failure sentence. It then draws NotSaved for
// "demo" and its alert for anything else.
export const failureOf = (error: unknown, own: string) => (isDemoRefusal(error) ? "demo" : own);

// One wording on every screen. "Try again" would be wrong: the change can never succeed.
const SAID: Record<Lang, string> = {
  en: "Nothing was saved. The demo cannot be changed.",
  fr: "Rien n'a été enregistré. La démo ne peut pas être modifiée.",
};

// Said beside the control that was pressed when the API refused the change for the demo account.
// It says what happened to the press and nothing about the demo's content: the demo line under
// the header is the one place that says that. It is a calm status, not an alert: a refusal is
// what the demo is meant to do. `spaced` is for where it stands in for a screen's failure sentence.
export function NotSaved({ lang, className, spaced }: { lang: Lang; className?: string; spaced?: boolean }) {
  return (
    <p className={[styles.notSaved, spaced && styles.spaced, className].filter(Boolean).join(" ")} role="status">
      {SAID[lang]}
    </p>
  );
}
