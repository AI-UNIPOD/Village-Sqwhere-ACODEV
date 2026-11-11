"use client";

import landing from "../../landing/landing-page.module.css";
import { copy } from "../../onboarding/copy";
import styles from "../../onboarding/onboarding.module.css";
import { useLang } from "../../onboarding/use-lang";

export default function OnboardingError({ retry }: { retry: () => void }) {
  const t = copy[useLang()];
  return (
    <main className={`${styles.column} ${styles.step}`}>
      <h1 className={styles.title}>{t.errorTitle}</h1>
      <p className={styles.why}>{t.errorText}</p>
      <div className={styles.actions}>
        <button type="button" className={landing.btn} onClick={retry}>
          {t.retry}
        </button>
      </div>
    </main>
  );
}
