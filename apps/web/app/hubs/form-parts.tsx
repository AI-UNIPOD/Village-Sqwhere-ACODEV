import type { ReactNode } from "react";

import landing from "../landing/landing-page.module.css";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import styles from "./hubs.module.css";

// An inline note that must not be missed: an icon tile, a title and one sentence.
export function Warning({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.warning}>
      <span className={styles.warningIcon} aria-hidden="true">
        <AlertCircle />
      </span>
      <div>
        <p className={styles.warningTitle}>{title}</p>
        <p className={styles.warningText}>{children}</p>
      </div>
    </div>
  );
}

// The message under a field. Its id is the field's id plus "-error", for `aria-describedby`.
export function FieldError({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={`${id}-error`} className={onboarding.error} role="alert">
      <AlertCircle />
      {children}
    </p>
  );
}

// A section that could not load: what happened and a way to try again, without taking the page down.
export function LoadFailed({ text, retry, onRetry }: { text: string; retry: string; onRetry: () => void }) {
  return (
    <div>
      <p className={`${onboarding.error} ${styles.problem}`} role="alert">
        <AlertCircle />
        {text}
      </p>
      <button type="button" className={`${landing.ghost} ${styles.send}`} onClick={onRetry}>
        {retry}
      </button>
    </div>
  );
}
