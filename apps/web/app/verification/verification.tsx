"use client";

import Link from "next/link";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, BadgeCheck } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { ROLES } from "../onboarding/options";
import type { MeRole } from "../session/me";
import { RequireSession } from "../session/session-ui";
import { ActiveAttempt } from "./active-attempt";
import { copy } from "./copy";
import { EarlierAttempts } from "./earlier-attempts";
import { StartForm } from "./start-form";
import { isActive, isFinished, useVerification, type Actions, type Attempt } from "./use-verification";
import styles from "./verification.module.css";

// Shown while the profile and the attempts load: blocks where the title and the steps will be.
export function VerificationSkeleton({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="verification">
      <main className={`${onboarding.column} ${styles.main}`} aria-busy="true">
        <p className={landing.srOnly} role="status">
          {copy[lang].loading}
        </p>
        <div className={onboarding.skeleton} aria-hidden="true">
          <div className={`${onboarding.block} ${onboarding.blockTitle}`} />
          <div className={`${onboarding.block} ${onboarding.blockText}`} />
          <div className={onboarding.block} />
          <div className={onboarding.block} />
          <div className={onboarding.spinner} />
        </div>
      </main>
    </AppFrame>
  );
}

function BackToVillage({ lang }: { lang: Lang }) {
  return (
    <Link className={`${landing.btn} ${styles.action}`} href={`/${lang}/village`}>
      {copy[lang].village}
    </Link>
  );
}

// State B: the role is verified.
function Verified({ lang, role }: { lang: Lang; role: MeRole }) {
  const t = copy[lang].verified;
  const since = new Date(role.verified_at!).toLocaleDateString(lang, { dateStyle: "long" });
  return (
    <section className={styles.success}>
      <span className={styles.tile} aria-hidden="true">
        <BadgeCheck />
      </span>
      <h2 className={styles.cardTitle}>{t.title}</h2>
      <p className={styles.cardText}>{fill(t.since, { date: since })}</p>
      <p className={styles.cardText}>{t.meaning}</p>
      <BackToVillage lang={lang} />
    </section>
  );
}

// State D: no attempt is active and the role is not verified. A person who ran out of
// attempts is told so and sent home. Anyone else sees how it works and the start form.
function NextAttempt({
  lang,
  role,
  newest,
  actions,
}: {
  lang: Lang;
  role: MeRole;
  newest?: Attempt;
  actions: Actions;
}) {
  const t = copy[lang];
  const { attempts_used: used, attempts_remaining: remaining } = role.verification;
  const last = newest?.status === "failed" || newest?.status === "abandoned" ? newest : undefined;
  return (
    <>
      {last && (
        <section className={styles.note}>
          <h2 className={styles.cardTitle}>
            <AlertCircle />
            {last.status === "failed" ? t.lastAttempt.failed : t.lastAttempt.abandoned}
          </h2>
          {last.reviewer_notes && (
            <div>
              <p className={styles.label}>{t.lastAttempt.notes}</p>
              <p className={styles.notes}>{last.reviewer_notes}</p>
            </div>
          )}
          {remaining > 0 && (
            <p className={styles.cardText}>
              {remaining === 1 ? t.lastAttempt.left.one : fill(t.lastAttempt.left.many, { n: remaining })}
            </p>
          )}
        </section>
      )}
      {remaining === 0 ? (
        <>
          <p className={styles.exhausted}>{t.lastAttempt.exhausted}</p>
          <BackToVillage lang={lang} />
        </>
      ) : (
        <>
          <h2 className={styles.subtitle}>{t.what.title}</h2>
          <ol className={styles.what}>
            {t.what.stages.map((stage) => (
              <li key={stage.title}>
                <strong>{stage.title}</strong> {stage.text}
              </li>
            ))}
          </ol>
          <StartForm lang={lang} slug={role.slug} attemptNumber={used + 1} actions={actions} />
        </>
      )}
    </>
  );
}

function Loaded({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const { me, role, slug, attempts, actions } = useVerification();
  // the attempts are needed only for a role that is not verified yet
  if (!me || (slug && !attempts)) return <VerificationSkeleton lang={lang} />;

  const roleName = role && (ROLES.find((r) => r.slug === role.slug)?.name[lang] ?? role.name);
  const active = attempts?.find(isActive);
  const earlier = attempts?.filter(isFinished) ?? [];
  return (
    <AppFrame lang={lang} path="verification">
      <main className={`${onboarding.column} ${styles.main}`}>
        <h1 className={styles.title}>{t.title}</h1>
        {roleName && <p className={styles.lead}>{fill(t.lead, { role: roleName })}</p>}

        {!role ? (
          <div className={onboarding.empty}>
            <BadgeCheck className={onboarding.emptyIcon} />
            <h2 className={onboarding.emptyTitle}>{t.noRole.title}</h2>
            <p>{t.noRole.text}</p>
            <Link className={landing.btn} href={`/${lang}/onboarding?step=role`}>
              {t.noRole.action}
            </Link>
          </div>
        ) : role.verified_at ? (
          <Verified lang={lang} role={role} />
        ) : active ? (
          <ActiveAttempt lang={lang} attempt={active} actions={actions} />
        ) : (
          <NextAttempt lang={lang} role={role} newest={attempts?.[0]} actions={actions} />
        )}

        {!role?.verified_at && earlier.length > 0 && <EarlierAttempts lang={lang} attempts={earlier} />}
      </main>
    </AppFrame>
  );
}

// Where a developer earns the Green Tick for their main role: an AI check of their public
// repositories, an interview, then the decision of a peer who already holds one.
export function Verification({ lang }: { lang: Lang }) {
  return (
    <RequireSession lang={lang} fallback={<VerificationSkeleton lang={lang} />}>
      <Loaded lang={lang} />
    </RequireSession>
  );
}
