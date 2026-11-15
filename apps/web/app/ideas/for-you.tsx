"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { Lightbulb, ShieldCheck, Users } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { useMe } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { OpenIdeaCard, authorName, roleName } from "./browse";
import { copy } from "./copy";
import { loadIdeasForMe, type IdeaMatch } from "./ideas-api";
import styles from "./ideas.module.css";
import { IdeasTabs } from "./ideas-tabs";
import { MatchScore, ScoreReasons } from "./match-score";
import { IdeasSkeleton } from "./my-ideas";
import { SimilarIdeaLine } from "./similar-ideas";

// Why the idea is here: its score and the parts of it, among them the developer's verified roles
// that the idea needs and what they share with its author.
function WhyLine({ lang, match }: { lang: Lang; match: IdeaMatch }) {
  const t = copy[lang].forYou;
  const { matched_roles: roles, idea } = match;
  const name = authorName(idea.author);
  return (
    <>
      {match.score !== undefined && <MatchScore lang={lang} score={match.score} partial={!!match.partial} />}
      <ScoreReasons
        lang={lang}
        scored={match}
        roles={fill(roles.length === 1 ? t.whyOne : t.whyMany, { roles: roles.map((role) => roleName(lang, role)).join(", ") })}
        technologies={(names) => fill(t.inCommon, { name, technologies: names })}
        sectors={(names) => fill(t.sectors, { name, sectors: names })}
      />
      {match.similar_idea && <SimilarIdeaLine lang={lang} idea={match.similar_idea} yours />}
    </>
  );
}

// What stands in for the list while there is nothing to match: what is missing and the one way on.
function Gap({ icon: Icon, title, text, href, action }: { icon: typeof Lightbulb; title: string; text: string; href: string; action: string }) {
  return (
    <div className={onboarding.empty}>
      <Icon className={onboarding.emptyIcon} />
      <h2 className={onboarding.emptyTitle}>{title}</h2>
      <p>{text}</p>
      <Link className={landing.btn} href={href}>
        {action}
      </Link>
    </div>
  );
}

function ForYouList({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const me = useMe();
  const [matches, setMatches] = useState<IdeaMatch[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  // only a verified role matches, so without one there is nothing to ask for
  const verified = me?.roles.some((role) => role.verified_at) ?? false;

  function load(offset: number) {
    return loadIdeasForMe(offset).then((page) => {
      setMatches((shown) => [...(offset === 0 ? [] : (shown ?? [])), ...page.data]);
      setNext(page.next_offset);
    });
  }

  useEffect(() => {
    if (!verified) return;
    load(0).catch((error: unknown) => {
      if (!(error instanceof SignedOutError)) setFailure(error instanceof Error ? error : new Error(String(error)));
    });
  }, [verified]);

  if (failure) throw failure;
  if (!me || (verified && !matches)) return <IdeasSkeleton lang={lang} />;

  return (
    <main className={`${onboarding.column} ${styles.main}`}>
      <h1 className={styles.title}>{t.forYou.title}</h1>
      <p className={styles.lead}>{t.forYou.lead}</p>
      <div className={styles.toolbar}>
        <IdeasTabs lang={lang} current="for-you" />
      </div>
      {me.roles.length === 0 ? (
        <Gap
          icon={Users}
          title={t.forYou.noProfileTitle}
          text={t.forYou.noProfileText}
          href={`/${lang}/onboarding?step=role`}
          action={t.forYou.setUp}
        />
      ) : !verified ? (
        <Gap icon={ShieldCheck} title={t.forYou.unverifiedTitle} text={t.forYou.unverifiedText} href={`/${lang}/verification`} action={t.forYou.verify} />
      ) : matches!.length === 0 ? (
        <Gap icon={Lightbulb} title={t.forYou.emptyTitle} text={t.forYou.emptyText} href={`/${lang}/ideas`} action={t.forYou.emptyAction} />
      ) : (
        <>
          <ul className={styles.list}>
            {matches!.map((match) => (
              <OpenIdeaCard key={match.idea.id} lang={lang} idea={match.idea} me={me} why={<WhyLine lang={lang} match={match} />} />
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

// The open ideas that need a role the developer is verified in, each saying which role.
export function ForYouIdeas({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="ideas/for-you">
      <RequireSession lang={lang} fallback={<IdeasSkeleton lang={lang} />}>
        <ForYouList lang={lang} />
      </RequireSession>
    </AppFrame>
  );
}
