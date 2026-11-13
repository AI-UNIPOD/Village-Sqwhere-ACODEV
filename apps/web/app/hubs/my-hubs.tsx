"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { Users } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { loadInvitations, loadMyHubs, type Hub } from "./hubs-api";
import styles from "./hubs.module.css";

// Shown while hubs load: blocks where the cards will be.
export function HubsSkeleton({ lang }: { lang: Lang }) {
  return (
    <main className={`${onboarding.column} ${ideas.main}`} aria-busy="true">
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
  );
}

// A hub that is not there, or an address with no hub in it.
export function MissingHub({ lang }: { lang: Lang }) {
  const t = copy[lang];
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

// The whole page while it loads, for a route's Suspense boundary.
export function HubsLoading({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="hubs">
      <HubsSkeleton lang={lang} />
    </AppFrame>
  );
}

function MyHubsList({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [hubs, setHubs] = useState<Hub[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // null while loading; empty when there are none or the request failed, which only hides the section
  const [invitations, setInvitations] = useState<Hub[] | null>(null);

  function load(offset: number) {
    return loadMyHubs(offset).then(
      (page) => {
        setHubs((shown) => [...(offset === 0 ? [] : (shown ?? [])), ...page.data]);
        setNext(page.next_offset);
      },
      (error: unknown) => {
        if (!(error instanceof SignedOutError)) setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
  }

  useEffect(() => {
    load(0);
    loadInvitations().then(setInvitations, () => setInvitations([]));
  }, []);

  if (failure) throw failure;
  if (!hubs || !invitations) return <HubsSkeleton lang={lang} />;

  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <h1 className={ideas.title}>{t.mineTitle}</h1>
      <p className={ideas.lead}>{t.mineLead}</p>
      {invitations.length > 0 && (
        <section>
          <h2 className={`${ideas.heading} ${styles.listHeading}`}>{t.invitations.heading}</h2>
          <ul className={ideas.list}>
            {invitations.map((hub) => (
              <li key={hub.id} className={ideas.card}>
                <h3 className={ideas.cardTitle}>
                  <Link href={`/${lang}/hubs/view?id=${hub.id}`}>{hub.name}</Link>
                </h3>
                <p className={ideas.summary}>{hub.idea.title}</p>
                <p className={ideas.meta}>{fill(t.invitations.by, { name: hub.owner.display_name })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {invitations.length > 0 && hubs.length > 0 && <h2 className={`${ideas.heading} ${styles.listHeading}`}>{t.yourHubs}</h2>}
      {hubs.length === 0 ? (
        <div className={onboarding.empty}>
          <Users className={onboarding.emptyIcon} />
          <h2 className={onboarding.emptyTitle}>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
          <Link className={landing.btn} href={`/${lang}/ideas/mine`}>
            {t.yourIdeas}
          </Link>
        </div>
      ) : (
        <>
          <ul className={ideas.list}>
            {hubs.map((hub) => (
              <li key={hub.id} className={ideas.card}>
                <div className={ideas.cardHead}>
                  <h2 className={ideas.cardTitle}>
                    <Link href={`/${lang}/hubs/view?id=${hub.id}`}>{hub.name}</Link>
                  </h2>
                  {hub.status === "archived" && (
                    <span className={village.pill} data-state="later">
                      {t.archived}
                    </span>
                  )}
                </div>
                <p className={ideas.summary}>{hub.idea.title}</p>
                <p className={ideas.meta}>
                  {hub.viewer.member_role === "owner" ? t.owner : t.member}
                  {" · "}
                  {fill(t.members, { n: hub.member_count })}
                </p>
              </li>
            ))}
          </ul>
          {next !== null && (
            <button
              type="button"
              className={`${landing.ghost} ${ideas.more}`}
              aria-busy={loadingMore || undefined}
              onClick={() => {
                if (loadingMore) return;
                setLoadingMore(true);
                load(next).finally(() => setLoadingMore(false));
              }}
            >
              {t.loadMore}
            </button>
          )}
        </>
      )}
    </main>
  );
}

// The hubs the signed-in developer is an active member of.
export function MyHubs({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="hubs">
      <RequireSession lang={lang} fallback={<HubsSkeleton lang={lang} />}>
        <MyHubsList lang={lang} />
      </RequireSession>
    </AppFrame>
  );
}
