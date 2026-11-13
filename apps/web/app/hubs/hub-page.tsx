"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { ArrowLeft, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { BriefSection } from "./brief";
import { copy } from "./copy";
import { loadHub, type Hub } from "./hubs-api";
import styles from "./hubs.module.css";
import { HubsSkeleton } from "./my-hubs";
import { InvitationCard, Person, Team } from "./team";

function HubCard({ lang, id, created, joined }: { lang: Lang; id: string | null; created: boolean; joined: boolean }) {
  const t = copy[lang];
  // undefined while loading, null when there is no such hub (or the address has no id)
  const [hub, setHub] = useState<Hub | null | undefined>(id ? undefined : null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    loadHub(id).then(
      (found) => live && setHub(found),
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        if (error instanceof IdeaError && (error.status === 404 || error.status === 422)) setHub(null);
        else setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (failure) throw failure;
  if (hub === null) {
    return (
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{t.missingHub.title}</h1>
        <p className={onboarding.why}>{t.missingHub.text}</p>
        <div className={onboarding.actions}>
          <Link className={landing.btn} href={`/${lang}/hubs`}>
            {t.yourHubs}
          </Link>
        </div>
      </main>
    );
  }
  if (!hub) return <HubsSkeleton lang={lang} />;

  const isOwner = hub.viewer.member_role === "owner";
  const status = hub.viewer.membership_status;
  const isMember = status === "active";
  const ownership = hub.terms.ownership_model && t.ownership[hub.terms.ownership_model];

  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <Link className={`${onboarding.back} ${ideas.backLink}`} href={`/${lang}/hubs`}>
        <ArrowLeft />
        {t.yourHubs}
      </Link>
      <h1 className={ideas.title}>{hub.name}</h1>
      <p className={styles.status}>
        <span className={village.pill} data-state={hub.status === "active" ? "done" : "later"}>
          {hub.status === "active" && <Check />}
          {hub.status === "active" ? t.active : t.archived}
        </span>
      </p>
      {created && isOwner && (
        <p className={`${ideas.done} ${styles.moment}`} role="status">
          <Check />
          {t.created}
        </p>
      )}
      {joined && isMember && (
        <p className={`${ideas.done} ${styles.moment}`} role="status">
          <Check />
          {t.joined}
        </p>
      )}
      {status === "invited" && <InvitationCard lang={lang} hub={hub} onChange={setHub} />}
      {status === "declined" && <p className={ideas.lead}>{t.declinedNote}</p>}
      {!isMember && status !== "invited" && status !== "declined" && <p className={ideas.lead}>{t.notMember}</p>}
      {hub.description && <p className={styles.text}>{hub.description}</p>}

      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.ideaHeading}</h2>
      <p className={styles.strong}>{hub.idea.title}</p>
      <p className={styles.text}>{hub.idea.summary}</p>
      {isOwner && (
        <p className={styles.line}>
          <Link href={`/${lang}/ideas/compose?id=${hub.idea.id}`}>{t.editIdea}</Link>
        </p>
      )}

      {isMember && <BriefSection lang={lang} hubId={hub.id} ideaId={hub.idea.id} isOwner={isOwner} moment={created || joined} />}

      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.teamHeading}</h2>
      {isMember ? (
        <Team lang={lang} hub={hub} />
      ) : (
        <>
          <p className={ideas.meta}>{fill(t.members, { n: hub.member_count })}</p>
          <ul className={styles.members}>
            <li className={styles.member}>
              <Person lang={lang} user={hub.owner} role={t.owner} />
            </li>
          </ul>
        </>
      )}

      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.termsHeading}</h2>
      {ownership && <p className={styles.strong}>{ownership.title}</p>}
      {/* the other two choices are explained by the owner's own notes */}
      {hub.terms.ownership_model === "equal_split" && <p className={styles.text}>{ownership?.text}</p>}
      {hub.terms.notes && <p className={styles.text}>{hub.terms.notes}</p>}
      <p className={`${ideas.meta} ${styles.line}`}>{t.termsFrozen}</p>
      <p className={`${ideas.meta} ${styles.line}`}>{fill(t.agreementVersion, { n: hub.agreement.version })}</p>

      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.phasesHeading}</h2>
      <ol className={styles.phases}>
        {t.phases.map((phase, at) => (
          <li key={phase}>
            <span className={styles.num} aria-hidden="true">
              {String(at + 1).padStart(2, "0")}
            </span>
            <span className={styles.strong}>{phase}</span>
            <span className={ideas.meta}>{t.notStarted}</span>
          </li>
        ))}
      </ol>
      <p className={ideas.lead}>{t.phasesNote}</p>
    </main>
  );
}

// One hub's card: what it builds, who is in it, the terms everyone signed and the four phases.
export function HubPage({ lang }: { lang: Lang }) {
  const search = useSearchParams();
  const id = search.get("id");
  return (
    <AppFrame lang={lang} path={`hubs/view${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<HubsSkeleton lang={lang} />}>
        <HubCard key={id ?? "none"} lang={lang} id={id} created={search.get("created") === "1"} joined={search.get("joined") === "1"} />
      </RequireSession>
    </AppFrame>
  );
}
