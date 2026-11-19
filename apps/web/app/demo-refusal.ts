import { copy } from "./feed/copy";
import { IdeaError } from "./ideas/ideas-api";
import type { Lang } from "./locales";

// The code the API refuses every change of the demo account with, whatever the control was.
export const DEMO_READ_ONLY = "DEMO_READ_ONLY";

export const isDemoRefusal = (error: unknown) => error instanceof IdeaError && error.code === DEMO_READ_ONLY;

// What a screen says where its failure sentence goes when the demo account's change was refused.
// It is the feed's sentence, so the demo says one thing on every screen. "Try again" would be
// wrong: the change can never succeed.
export const notSaved = (lang: Lang) => copy[lang].notSaved;

// The sentence for a change that did not go through: the demo's when the demo refused it,
// otherwise the screen's own.
export const failureLine = (error: unknown, lang: Lang, own: string) => (isDemoRefusal(error) ? notSaved(lang) : own);
