"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { ArrowRight, Check, Inbox, ShieldCheck } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { useMe, type Me } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { copy } from "./copy";
import styles from "./reviews.module.css";
import { loadQueue, repositories, roleName, type Attempt, type Decision } from "./reviews";

type Page = { items: Attempt[]; next: number | null };

// How long an attempt has waited: minutes and hours count whole, days round ("47 hours" is 2 days).
function waited(since: string, now: number, lang: Lang): string {
  const minutes = Math.max(1, Math.floor((now - Date.parse(since)) / 60_000));
  const [value, unit] =
    minutes < 60 ? [minutes, "minute"] : minutes < 1440 ? [Math.floor(minutes / 60), "hour"] : [Math.round(minutes / 1440), "day"];
  return new Intl.NumberFormat(lang, { style: "unit", unit, unitDisplay: "long" }).format(value);
}

// Shown while the profile loads: blocks where the title and the first cards will be.
export function QueueSkeleton({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="reviews">
      <main className={`${onboarding.column} ${styles.main}`} aria-busy="true">
        <p className={landing.srOnly} role="status">
          {copy[lang].loading}
        </p>
        <div className={onboarding.skeleton} aria-hidden="true">
          <div className={`${onboarding.block} ${onboarding.blockTitle}`} />
          <div className={`${onboarding.block} ${onboarding.blockText}`} />
          <div className={onboarding.block} />
          <div className={onboarding.block} />
        </div>
      </main>
    </AppFrame>
  );
}

function Cases({ lang }: { lang: Lang }) {
  const t = copy[lang];
  // read once per visit, so every card counts from the same moment
  const [now] = useState(() => Date.now());
  const [page, setPage] = useState<Page | Error | null>(null);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  const list = useRef<HTMLUListElement>(null);
  const firstNew = useRef<number | null>(null);

  useEffect(() => {
    let live = true;
    loadQueue(0).then(
      (first) => live && setPage(first),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setPage(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // Pressing "Load more" removes the button when the list ends: keep the keyboard in the list.
  const count = page instanceof Error || !page ? 0 : page.items.length;
  useEffect(() => {
    if (firstNew.current === null) return;
    list.current?.querySelectorAll("a")[firstNew.current]?.focus();
    firstNew.current = null;
  }, [count]);

  if (page instanceof Error) throw page;
  if (!page) {
    return (
      <div className={onboarding.skeleton} aria-hidden="true">
        <div className={onboarding.block} />
        <div className={onboarding.block} />
        <div className={onboarding.spinner} />
      </div>
    );
  }
  if (page.items.length === 0) {
    return (
      <div className={onboarding.empty}>
        <Inbox className={onboarding.emptyIcon} />
        <h2 className={onboarding.emptyTitle}>{t.emptyTitle}</h2>
        <p>{t.emptyText}</p>
      </div>
    );
  }

  const loadMore = () => {
    if (more === "loading" || page.next === null) return;
    setMore("loading");
    loadQueue(page.next).then(
      (next) => {
        firstNew.current = page.items.length;
        setPage({ items: [...page.items, ...next.items], next: next.next });
        setMore("idle");
      },
      () => setMore("failed"),
    );
  };

  return (
    <>
      <ul className={styles.list} ref={list}>
        {page.items.map((attempt) => {
          const repos = repositories(attempt).length;
          const facts = [
            fill(t.attempt, { n: attempt.attempt_number }),
            fill(t.waiting, { time: waited(attempt.completed_at ?? attempt.created_at, now, lang) }),
            repos === 1 ? t.repoOne : fill(t.repoMany, { n: repos }),
          ];
          return (
            <li key={attempt.id}>
              <Link className={styles.card} href={`/${lang}/reviews/case?id=${encodeURIComponent(attempt.id)}`}>
                <span className={styles.cardRole}>{roleName(attempt, lang)}</span>
                <span className={styles.cardFacts}>{facts.join(" · ")}</span>
                <span className={styles.cardGo}>
                  {t.review}
                  <ArrowRight />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {more === "failed" && (
        <p className={onboarding.error} role="alert">
          {t.moreFailed}
        </p>
      )}
      {page.next !== null && (
        <div className={onboarding.actions}>
          <button
            type="button"
            className={landing.ghost}
            aria-busy={more === "loading"}
            aria-disabled={more === "loading"}
            onClick={loadMore}
          >
            {t.loadMore}
            {more === "loading" && <span className={styles.spinner} aria-hidden="true" />}
          </button>
        </div>
      )}
    </>
  );
}

function Queue({ lang, me }: { lang: Lang; me: Me }) {
  const t = copy[lang];
  const router = useRouter();
  const params = useSearchParams();
  // A decision sends the reviewer here with ?done=: show it once, then drop it from the
  // address so a reload does not repeat it.
  const [done] = useState<Decision | null>(() => {
    const value = params.get("done");
    return value === "passed" || value === "failed" ? value : null;
  });
  useEffect(() => {
    if (done) router.replace(`/${lang}/reviews`);
  }, [done, lang, router]);

  return (
    <AppFrame lang={lang} path="reviews">
      <main className={`${onboarding.column} ${styles.main}`}>
        {done && (
          <p className={styles.done} role="status">
            <Check />
            {t.done[done]}
          </p>
        )}
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.lead}>{t.lead}</p>
        {me.roles.some((role) => role.verified_at) ? (
          <Cases lang={lang} />
        ) : (
          <div className={onboarding.empty}>
            <ShieldCheck className={onboarding.emptyIcon} />
            <h2 className={onboarding.emptyTitle}>{t.notVerifiedTitle}</h2>
            <p>{t.notVerifiedText}</p>
            <Link className={landing.btn} href={`/${lang}/verification`}>
              {t.notVerifiedAction}
            </Link>
          </div>
        )}
      </main>
    </AppFrame>
  );
}

function WithMe({ lang }: { lang: Lang }) {
  const me = useMe();
  return me ? <Queue lang={lang} me={me} /> : <QueueSkeleton lang={lang} />;
}

// The attempts waiting for a developer who holds a Green Tick, oldest first.
export function ReviewQueue({ lang }: { lang: Lang }) {
  return (
    <RequireSession lang={lang} fallback={<QueueSkeleton lang={lang} />}>
      <WithMe lang={lang} />
    </RequireSession>
  );
}
