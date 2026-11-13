"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import { copy as hubsCopy } from "../hubs/copy";
import { loadMyHubs } from "../hubs/hubs-api";
import hubsStyles from "../hubs/hubs.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { Check, Cross, Lightbulb, Lock } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { ROLES } from "../onboarding/options";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { loadMyIdeas, type OwnedIdea } from "./ideas-api";
import styles from "./ideas.module.css";

// a draft is private, an open idea is live, a closed one is over
const STATUS = {
  draft: { icon: Lock, state: "later" },
  open: { icon: Check, state: "done" },
  closed: { icon: Cross, state: "later" },
} as const;

// Shown while ideas load: blocks where the cards will be.
export function IdeasSkeleton({ lang }: { lang: Lang }) {
  return (
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
  );
}

// The whole page while it loads, for the route's Suspense boundary.
export function IdeasLoading({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="ideas/mine">
      <IdeasSkeleton lang={lang} />
    </AppFrame>
  );
}

// `hubs` maps an idea's id to its hub's id; null while it loads, and when it could not be loaded.
function IdeaCard({ lang, idea, hubs }: { lang: Lang; idea: OwnedIdea; hubs: Record<string, string> | null }) {
  const t = copy[lang];
  const hubId = hubs?.[idea.id];
  const { icon: StatusIcon, state } = STATUS[idea.status];
  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          <Link href={`/${lang}/ideas/compose?id=${idea.id}`}>{idea.title}</Link>
        </h2>
        <span className={village.pill} data-state={state}>
          <StatusIcon />
          {t.status[idea.status]}
        </span>
      </div>
      <p className={styles.summary}>{idea.summary}</p>
      <ul className={styles.roles} aria-label={t.rolesNeeded}>
        {idea.roles_needed.length === 0 && <li className={styles.meta}>{t.noRoles}</li>}
        {idea.roles_needed.map((role) => (
          <li key={role.slug} className={styles.role}>
            {ROLES.find((known) => known.slug === role.slug)?.name[lang] ?? role.name}
          </li>
        ))}
      </ul>
      <p className={styles.meta}>
        {t.stage[idea.stage]}
        {" · "}
        {fill(t.updated, { date: new Date(idea.updated_at).toLocaleDateString(lang, { dateStyle: "medium" }) })}
      </p>
      {/* an open idea leads to its hub: the one it has, or the form that creates it */}
      {idea.status === "open" && hubs && (
        <Link
          className={hubsStyles.cardLink}
          href={hubId ? `/${lang}/hubs/view?id=${hubId}` : `/${lang}/hubs/new?idea=${idea.id}`}
        >
          {hubId ? hubsCopy[lang].openHub : hubsCopy[lang].createHub}
        </Link>
      )}
    </li>
  );
}

function MyIdeasList({ lang }: { lang: Lang }) {
  const t = copy[lang];
  // set by the composer after publishing or closing
  const done = useSearchParams().get("done");
  const message = done === "published" ? t.donePublished : done === "closed" ? t.doneClosed : null;
  const [ideas, setIdeas] = useState<OwnedIdea[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hubs, setHubs] = useState<Record<string, string> | null>(null);

  function load(offset: number) {
    return loadMyIdeas(offset).then(
      (page) => {
        setIdeas((shown) => [...(offset === 0 ? [] : (shown ?? [])), ...page.data]);
        setNext(page.next_offset);
      },
      (error: unknown) => {
        if (!(error instanceof SignedOutError)) setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
  }

  useEffect(() => {
    load(0);
    // shortcut: the first 20 hubs only, enough while a developer has a handful; page through them if that grows
    loadMyHubs()
      .then((page) => setHubs(Object.fromEntries(page.data.map((hub) => [hub.idea.id, hub.id]))))
      .catch(() => setHubs(null));
  }, []);

  if (failure) throw failure;
  if (!ideas) return <IdeasSkeleton lang={lang} />;

  const share = (
    <Link className={`${landing.btn} ${styles.share}`} href={`/${lang}/ideas/compose`}>
      {t.newIdea}
    </Link>
  );

  return (
    <main className={`${onboarding.column} ${styles.main}`}>
      <h1 className={styles.title}>{t.mineTitle}</h1>
      <p className={styles.lead}>{t.mineLead}</p>
      {message && (
        <p className={styles.done} role="status">
          <Check />
          {message}
        </p>
      )}
      {ideas.length === 0 ? (
        <div className={onboarding.empty}>
          <Lightbulb className={onboarding.emptyIcon} />
          <h2 className={onboarding.emptyTitle}>{t.emptyTitle}</h2>
          <p>{t.emptyText}</p>
          {share}
        </div>
      ) : (
        <>
          {share}
          <ul className={styles.list}>
            {ideas.map((idea) => (
              <IdeaCard key={idea.id} lang={lang} idea={idea} hubs={hubs} />
            ))}
          </ul>
          {next !== null && (
            <button
              type="button"
              className={`${landing.ghost} ${styles.more}`}
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

// The signed-in developer's own ideas: drafts, open and closed.
export function MyIdeas({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="ideas/mine">
      <RequireSession lang={lang} fallback={<IdeasSkeleton lang={lang} />}>
        <MyIdeasList lang={lang} />
      </RequireSession>
    </AppFrame>
  );
}
