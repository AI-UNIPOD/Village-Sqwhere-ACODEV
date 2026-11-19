import type { Lang } from "../locales";
import { copy } from "./copy";
import styles from "./feed.module.css";

// The demo account's changes are refused by the API with one code, whatever the control was.
export { isDemoRefusal } from "../demo-refusal";

// Said beside the control that was pressed when the API refused the change for the demo account.
// It says what happened to the press and nothing about the demo's content: the demo line under
// the header is the one place that says that.
export function NotSaved({ lang, className }: { lang: Lang; className?: string }) {
  return (
    <p className={className ? `${styles.notSaved} ${className}` : styles.notSaved} role="status">
      {copy[lang].notSaved}
    </p>
  );
}
