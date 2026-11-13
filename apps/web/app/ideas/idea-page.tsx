"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { ArrowLeft, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { useMe, type Me } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { FitLine, RoleChips, fitOf } from "./browse";
import { copy } from "./copy";
import { IdeaError, loadOpenIdea, type PublicIdea } from "./ideas-api";
import styles from "./ideas.module.css";
import { IdeasSkeleton } from "./my-ideas";

// The one thing this developer can do about the idea. There is no "ask to join": the owner
// invites, so the action is whatever makes them someone the owner can be shown.
function NextStep({ lang, idea, me }: { lang: Lang; idea: PublicIdea; me: Me }) {
  const t = copy[lang].open;
  if (idea.author.username === me.username) {
    return (
      <Link className={`${landing.btn} ${styles.act}`} href={`/${lang}/ideas/compose?id=${idea.id}`}>
        {t.edit}
      </Link>
    );
  }
  if (me.roles.length === 0) {
    return (
      <>
        <p className={styles.lead}>{t.setUpWhy}</p>
        <Link className={`${landing.btn} ${styles.act}`} href={`/${lang}/onboarding?step=role`}>
          {t.setUp}
        </Link>
      </>
    );
  }
  const fit = fitOf(idea, me);
  if (!fit) return <p className={styles.lead}>{t.otherRoles}</p>;
  if (fit.verified) {
    return (
      <p className={styles.done} role="status">
        <Check />
        {t.fitNote}
      </p>
    );
  }
  return (
    <>
      <p className={styles.lead}>{t.verifyWhy}</p>
      <Link className={`${landing.btn} ${styles.act}`} href={`/${lang}/verification`}>
        {t.verify}
      </Link>
    </>
  );
}

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
  const github = (text: string) => (
    <a href={`https://github.com/${encodeURIComponent(author.username)}`} target="_blank" rel="noopener noreferrer">
      {text} <span className={landing.srOnly}>({t.open.githubProfile})</span>
    </a>
  );
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
          <p className={village.name}>{named ? author.display_name : github(author.username)}</p>
          {named && <p className={village.username}>{github(`@${author.username}`)}</p>}
          {author.is_verified && (
            <p className={styles.verified}>
              <Check />
              {t.browse.verified}
            </p>
          )}
        </div>
      </div>

      <h2 className={styles.heading}>{t.open.joinTitle}</h2>
      <ol className={styles.join}>
        {t.open.joinSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <NextStep lang={lang} idea={idea} me={me} />
    </main>
  );
}

// One open idea, as any signed-in developer sees it: the public part, and how joining works.
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
