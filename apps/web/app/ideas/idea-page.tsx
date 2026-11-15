"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { AskToJoin } from "../hubs/ask-to-join";
import { copy as hubCopy } from "../hubs/copy";
import { fill } from "../onboarding/copy";
import { ArrowLeft, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { useMe } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { FitLine, RoleChips } from "./browse";
import { copy } from "./copy";
import { IdeaError, loadOpenIdea, type PublicIdea } from "./ideas-api";
import styles from "./ideas.module.css";
import { IdeasSkeleton } from "./my-ideas";
import { SimilarIdeas } from "./similar-ideas";

function OpenIdea({ lang, id }: { lang: Lang; id: string | null }) {
  const t = copy[lang];
  const me = useMe();
  // undefined while loading, null when the idea is not open (or the address has no id)
  const [idea, setIdea] = useState<PublicIdea | null | undefined>(id ? undefined : null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    loadOpenIdea(id).then(
      (found) => live && setIdea(found),
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        if (error instanceof IdeaError && (error.status === 404 || error.status === 422)) setIdea(null);
        else setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (failure) throw failure;
  if (idea === null) {
    return (
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{t.open.goneTitle}</h1>
        <p className={onboarding.why}>{t.open.goneText}</p>
        <div className={onboarding.actions}>
          <Link className={landing.btn} href={`/${lang}/ideas`}>
            {t.open.back}
          </Link>
        </div>
      </main>
    );
  }
  if (!idea || !me) return <IdeasSkeleton lang={lang} />;

  const { author } = idea;
  const named = author.display_name !== author.username;
  const profile = (text: string) => <Link href={`/${lang}/people/view?username=${encodeURIComponent(author.username)}`}>{text}</Link>;
  return (
    <main className={`${onboarding.column} ${styles.main}`}>
      <Link className={`${onboarding.back} ${styles.backLink}`} href={`/${lang}/ideas`}>
        <ArrowLeft />
        {t.open.back}
      </Link>
      <h1 className={styles.title}>{idea.title}</h1>
      <p className={styles.viewMeta}>
        <span className={village.pill} data-state="later">
          {t.stage[idea.stage]}
        </span>
        <span className={styles.meta}>
          {fill(t.browse.published, { date: new Date(idea.published_at).toLocaleDateString(lang, { dateStyle: "long" }) })}
        </span>
      </p>
      <p className={styles.body}>{idea.summary}</p>

      <h2 className={styles.heading}>{t.rolesNeeded}</h2>
      <div className={styles.block}>
        <FitLine lang={lang} idea={idea} me={me} />
        <RoleChips lang={lang} idea={idea} empty={t.open.noRoles} />
      </div>

      <h2 className={styles.heading}>{t.open.sharedBy}</h2>
      <div className={`${village.person} ${styles.block}`}>
        <span className={village.avatar} aria-hidden="true">
          {(named ? author.display_name : author.username)
            .split(" ")
            .map((word) => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div>
          <p className={village.name}>{named ? profile(author.display_name) : profile(author.username)}</p>
          {named && <p className={village.username}>@{author.username}</p>}
          {author.is_verified && (
            <p className={styles.verified}>
              <Check />
              {t.browse.verified}
            </p>
          )}
        </div>
      </div>

      {idea.author.username === me.username ? (
        <Link className={`${landing.btn} ${styles.act}`} href={`/${lang}/ideas/compose?id=${idea.id}`}>
          {t.open.edit}
        </Link>
      ) : (
        <>
          <h2 className={styles.heading}>{hubCopy[lang].ask.heading}</h2>
          <AskToJoin key={idea.hub_id ?? "none"} lang={lang} hubId={idea.hub_id} />
        </>
      )}

      <SimilarIdeas lang={lang} id={idea.id} />
    </main>
  );
}

// One open idea, as any signed-in developer sees it: the public part, and the step towards its team.
export function IdeaPage({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  return (
    <AppFrame lang={lang} path={`ideas/view${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<IdeasSkeleton lang={lang} />}>
        {/* another idea is another page: nothing loaded for one may show for the next */}
        <OpenIdea key={id ?? "none"} lang={lang} id={id} />
      </RequireSession>
    </AppFrame>
  );
}
