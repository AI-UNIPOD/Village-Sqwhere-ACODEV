"use client";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import { copy } from "./copy";
import styles from "./onboarding.module.css";
import { useLang } from "./use-lang";

// Shown while the page loads: blocks where the first question will be, and a spinner only if
// the wait is long. The label is for screen readers.
export function OnboardingSkeleton() {
  const lang = useLang();
  const t = copy[lang];
  return (
    <AppFrame lang={lang} path="onboarding">
      <main className={`${styles.column} ${styles.step}`} aria-busy="true">
        <p className={landing.srOnly} role="status">
          {t.loading}
        </p>
        <div className={styles.skeleton} aria-hidden="true">
          <div className={`${styles.block} ${styles.blockTitle}`} />
          <div className={`${styles.block} ${styles.blockText}`} />
          <div className={styles.block} />
          <div className={styles.block} />
          <div className={styles.block} />
          <div className={styles.spinner} />
        </div>
      </main>
    </AppFrame>
  );
}
