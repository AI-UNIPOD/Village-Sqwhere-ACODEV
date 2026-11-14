"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { Check, Lightbulb, Users } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { ROLES, TECHNOLOGIES } from "../onboarding/options";
import { useMe, type Me } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { loadOpenIdeas, type PublicIdea } from "./ideas-api";
import styles from "./ideas.module.css";
import { IdeasTabs } from "./ideas-tabs";
import { IdeasSkeleton } from "./my-ideas";

export const roleName = (lang: Lang, role: { slug: string; name: string }) =>
  ROLES.find((known) => known.slug === role.slug)?.name[lang] ?? role.name;

export const technologyName = (lang: Lang, tech: { slug: string; name: string }) =>
  TECHNOLOGIES.find((known) => known.slug === tech.slug)?.name[lang] ?? tech.name;

// GitHub accounts without a name get the username as their name: show it once.
export const authorName = (author: PublicIdea["author"]) =>
  author.display_name === author.username ? `@${author.username}` : author.display_name;

// The role of the developer's that this idea needs, a verified one first. Slugs only: the
// line it feeds must be exactly true.
export function fitOf(idea: PublicIdea, me: Me) {
  const mine = me.roles.filter((role) => idea.roles_needed.some((needed) => needed.slug === role.slug));
  const role = mine.find((r) => r.verified_at) ?? mine[0];
  return role ? { role, verified: !!role.verified_at } : null;
}

// "Needs your role", and for a role not verified yet, how to become someone the owner sees.
export function FitLine({ lang, idea, me }: { lang: Lang; idea: PublicIdea; me: Me }) {
  const t = copy[lang].browse;
  const fit = fitOf(idea, me);
  if (!fit) return null;
  return (
    <p className={styles.fit}>
      <Users />
      <span>
        {fill(t.fitNeeds, { role: roleName(lang, fit.role) })}
        {!fit.verified && (
          <>
            {". "}
            <Link href={`/${lang}/verification`}>{t.fitVerify}</Link> {t.fitVerifyWhy}
          </>
        )}
      </span>
    </p>
  );
}

export function RoleChips({ lang, idea, empty }: { lang: Lang; idea: PublicIdea; empty: string }) {
  return (
    <ul className={styles.roles} aria-label={copy[lang].rolesNeeded}>
      {idea.roles_needed.length === 0 && <li className={styles.meta}>{empty}</li>}
      {idea.roles_needed.map((role) => (
        <li key={role.slug} className={styles.role}>
          {roleName(lang, role)}
        </li>
      ))}
    </ul>
  );
}

// `why` replaces the line about the developer's fit, for a list that already says why each idea is there.
export function OpenIdeaCard({ lang, idea, me, why }: { lang: Lang; idea: PublicIdea; me: Me; why?: ReactNode }) {
  const t = copy[lang];
  const yours = idea.author.username === me.username;
  return (
    <li className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>
          <Link href={yours ? `/${lang}/ideas/compose?id=${idea.id}` : `/${lang}/ideas/view?id=${idea.id}`}>{idea.title}</Link>
        </h2>
        {yours && (
          <span className={village.pill} data-state="next">
            <Check />
            {t.browse.yours}
          </span>
        )}
      </div>
      <p className={styles.summary}>{idea.summary}</p>
      {why ?? (!yours && <FitLine lang={lang} idea={idea} me={me} />)}
      <RoleChips lang={lang} idea={idea} empty={t.noRoles} />
      <p className={styles.meta}>
        {t.stage[idea.stage]}
        {" · "}
        {fill(t.browse.by, { name: authorName(idea.author) })}
        {idea.author.is_verified && (
          <span className={styles.verified}>
            <Check />
            {t.browse.verified}
          </span>
        )}
        {" · "}
        {fill(t.browse.published, { date: new Date(idea.published_at).toLocaleDateString(lang, { dateStyle: "medium" }) })}
      </p>
    </li>
  );
}

function OpenIdeas({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const me = useMe();
  const [ideas, setIdeas] = useState<PublicIdea[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");

  function load(offset: number) {
    return loadOpenIdeas(offset).then((page) => {
      setIdeas((shown) => [...(offset === 0 ? [] : (shown ?? [])), ...page.data]);
      setNext(page.next_offset);
    });
  }

  useEffect(() => {
    load(0).catch((error: unknown) => {
      if (!(error instanceof SignedOutError)) setFailure(error instanceof Error ? error : new Error(String(error)));
    });
  }, []);

  if (failure) throw failure;
  if (!ideas || !me) return <IdeasSkeleton lang={lang} />;

  return (
    <main className={`${onboarding.column} ${styles.main}`}>
      <h1 className={styles.title}>{t.browse.title}</h1>
      <p className={styles.lead}>{t.browse.lead}</p>
      <div className={styles.toolbar}>
        <IdeasTabs lang={lang} current="open" />
        {ideas.length > 0 && (
          <Link className={landing.ghost} href={`/${lang}/ideas/compose`}>
            {t.newIdea}
          </Link>
        )}
      </div>
      {ideas.length === 0 ? (
        <div className={onboarding.empty}>
          <Lightbulb className={onboarding.emptyIcon} />
          <h2 className={onboarding.emptyTitle}>{t.browse.emptyTitle}</h2>
          <p>{t.browse.emptyText}</p>
          <Link className={landing.btn} href={`/${lang}/ideas/compose`}>
            {t.newIdea}
          </Link>
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {ideas.map((idea) => (
              <OpenIdeaCard key={idea.id} lang={lang} idea={idea} me={me} />
            ))}
          </ul>
          {more === "failed" && (
            <p className={`${onboarding.error} ${styles.moreFailed}`} role="alert">
              {t.browse.moreFailed}
            </p>
          )}
          {next !== null && (
            <button
              type="button"
              className={`${landing.ghost} ${styles.more}`}
              aria-busy={more === "loading" || undefined}
              onClick={() => {
                if (more === "loading") return;
                setMore("loading");
                load(next).then(
                  () => setMore("idle"),
                  (error: unknown) => !(error instanceof SignedOutError) && setMore("failed"),
                );
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

// Every open idea, for a developer looking for something to join.
export function BrowseIdeas({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="ideas">
      <RequireSession lang={lang} fallback={<IdeasSkeleton lang={lang} />}>
        <OpenIdeas lang={lang} />
      </RequireSession>
    </AppFrame>
  );
}
