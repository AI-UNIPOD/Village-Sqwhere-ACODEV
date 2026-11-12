"use client";

import landing from "../../landing/landing-page.module.css";
import { copy } from "../../onboarding/copy";
import { OnboardingFrame } from "../../onboarding/onboarding-frame";
import styles from "../../onboarding/onboarding.module.css";
import { useLang } from "../../onboarding/use-lang";

export default function OnboardingError({ retry }: { retry: () => void }) {
  const lang = useLang();
  const t = copy[lang];
  return (
    <OnboardingFrame lang={lang}>
      <main className={`${styles.column} ${styles.step}`}>
        <h1 className={styles.title}>{t.errorTitle}</h1>
        <p className={styles.why}>{t.errorText}</p>
        <div className={styles.actions}>
          <button type="button" className={landing.btn} onClick={retry}>
            {t.retry}
          </button>
        </div>
      </main>
    </OnboardingFrame>
  );
}
