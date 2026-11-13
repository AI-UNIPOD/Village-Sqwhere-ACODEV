import type { ComponentType } from "react";

import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { Ban, Check, X } from "../onboarding/icons";
import village from "../village/village.module.css";
import { copy } from "./copy";
import type { Finished } from "./use-verification";
import styles from "./verification.module.css";

const OUTCOMES: Record<Finished["status"], { Icon: ComponentType; state?: string; failed?: boolean }> = {
  passed: { Icon: Check, state: "done" },
  failed: { Icon: X, failed: true },
  abandoned: { Icon: Ban },
};

// State E: attempts that are over, newest first, each with its outcome and any reviewer notes.
export function EarlierAttempts({ lang, attempts }: { lang: Lang; attempts: Finished[] }) {
  const t = copy[lang].earlier;
  return (
    <section aria-labelledby="earlier-title">
      <h2 id="earlier-title" className={styles.subtitle}>
        {t.title}
      </h2>
      <ul className={styles.history}>
        {attempts.map((attempt) => {
          const { Icon, state, failed } = OUTCOMES[attempt.status];
          const started = new Date(attempt.started_at ?? attempt.created_at).toLocaleDateString(lang, { dateStyle: "long" });
          return (
            <li key={attempt.id} className={styles.past}>
              <div className={styles.pastHead}>
                <h3>{fill(t.attempt, { n: attempt.attempt_number })}</h3>
                <span className={`${village.pill} ${failed ? styles.failed : ""}`} data-state={state}>
                  <Icon />
                  {t[attempt.status]}
                </span>
              </div>
              <p className={styles.date}>{fill(t.started, { date: started })}</p>
              {attempt.reviewer_notes && (
                <>
                  <p className={styles.label}>{t.notes}</p>
                  <p className={styles.notes}>{attempt.reviewer_notes}</p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
