"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import ideas from "../ideas/ideas.module.css";
import type { Lang } from "../locales";
import { Lock } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { LoadFailed } from "./form-parts";
import { loadBrief, type Brief } from "./hubs-api";
import styles from "./hubs.module.css";

type Props = { lang: Lang; hubId: string; ideaId: string; isOwner: boolean; moment: boolean };

// The idea's confidential brief, which only the hub's members can read. `moment` is for the
// screen right after joining or creating, when the section arrives after the success message.
export function BriefSection({ lang, hubId, ideaId, isOwner, moment }: Props) {
  const t = copy[lang].brief;
  const [brief, setBrief] = useState<Brief | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    loadBrief(hubId).then(
      (found) => live && setBrief(found),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [hubId, attempt]);

  return (
    <section className={moment ? styles.momentBrief : undefined} aria-busy={(!brief && !failed) || undefined}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.heading}</h2>
      <p className={styles.private}>
        <Lock />
        {t.private}
      </p>
      {failed ? (
        <LoadFailed
          text={t.loadFailed}
          retry={copy[lang].retry}
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : !brief ? (
        <div className={`${onboarding.skeleton} ${styles.pending}`} aria-hidden="true">
          <div className={onboarding.block} />
        </div>
      ) : brief.details ? (
        <p className={styles.text}>{brief.details}</p>
      ) : (
        <>
          <p className={styles.text}>{t.empty}</p>
          {isOwner && (
            <p className={styles.line}>
              <Link href={`/${lang}/ideas/compose?id=${ideaId}`}>{t.write}</Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
