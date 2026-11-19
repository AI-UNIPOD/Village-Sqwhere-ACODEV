"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { Bookmark, Check, Newspaper } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { useMe } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { copy } from "./copy";
import { filterQuery, loadFeed, loadPostsBy, loadSavedPosts, type FeedFilter, type Post } from "./feed-api";
import { FeedFilters, feedHref, readFilter } from "./feed-filter";
import { FeedTabs, type Tab } from "./feed-tabs";
import { FeedTopics } from "./feed-topics";
import { PostCard } from "./post-card";

// Where each tab lives, as AppFrame wants it: the language link opens the same tab.
const PATHS = { "for-you": "feed", saved: "feed/saved", mine: "feed/mine" } as const;

// The list's place while its posts load, under a title and tabs that are already there.
function Blocks({ lang }: { lang: Lang }) {
  return (
    <>
      <p className={landing.srOnly} role="status">
        {copy[lang].loading}
      </p>
      <div className={onboarding.skeleton} aria-hidden="true">
        <div className={onboarding.block} />
        <div className={onboarding.block} />
        <div className={onboarding.block} />
        <div className={onboarding.spinner} />
      </div>
    </>
  );
}

// Shown while the page opens: blocks where the title and the first posts will be.
export function FeedSkeleton({ label }: { label: string }) {
  return (
    <main className={`${onboarding.column} ${ideas.main}`} aria-busy="true">
      <p className={landing.srOnly} role="status">
        {label}
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
export function FeedLoading({ lang, tab }: { lang: Lang; tab: Tab }) {
  return (
    <AppFrame lang={lang} path={PATHS[tab]}>
      <FeedSkeleton label={copy[lang].loading} />
    </AppFrame>
  );
}

// `filtered`: the address narrows the list, so the way on is back to the feed without the filter.
function Empty({ lang, tab, filtered }: { lang: Lang; tab: Tab; filtered: boolean }) {
  const t = filtered ? copy[lang].filter.empty : copy[lang].empty[tab === "for-you" ? "forYou" : tab];
  const EmptyIcon = tab === "saved" ? Bookmark : Newspaper;
  return (
    <div className={onboarding.empty}>
      <EmptyIcon className={onboarding.emptyIcon} />
      <h2 className={onboarding.emptyTitle}>{t.title}</h2>
      <p>{t.text}</p>
      <Link
        className={landing.ghost}
        href={filtered ? feedHref(lang) : tab === "for-you" ? `/${lang}/ideas` : tab === "mine" ? `/${lang}/posts/compose` : `/${lang}/feed`}
      >
        {t.action}
      </Link>
    </div>
  );
}

// The posts one tab asks for, a page at a time. Likes and saves live in this list's own state,
// so coming back to the tab (the app keeps it) shows what the person last did, until it loads again.
// `username` is for Yours, which cannot start without it. `filter` is the kind and the topic the
// address asks for: every page of the list is asked for with them.
function PostList({ lang, tab, username, filter }: { lang: Lang; tab: Tab; username?: string; filter: FeedFilter }) {
  const t = copy[lang];
  const { type, topic } = filter;
  // read once per visit, so every post counts from the same moment
  const [now] = useState(() => Date.now());
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failure, setFailure] = useState<Error | null>(null);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");

  const show = useCallback(
    (offset: number) => {
      const loading = tab === "saved" ? loadSavedPosts(offset) : tab === "mine" ? loadPostsBy(username!, offset) : loadFeed(offset, { type, topic });
      return loading.then((page) => {
        // a post can move down a page while the next one loads, and would show twice
        setPosts((shown) => {
          const kept = offset === 0 ? [] : (shown ?? []);
          return [...kept, ...page.data.filter((post) => !kept.some((have) => have.id === post.id))];
        });
        setNext(page.next_offset);
      });
    },
    [tab, username, type, topic],
  );

  useEffect(() => {
    let live = true;
    show(0).catch((error: unknown) => {
      if (live && !(error instanceof SignedOutError)) setFailure(error instanceof Error ? error : new Error(String(error)));
    });
    return () => {
      live = false;
    };
  }, [show]);

  if (failure) throw failure;
  if (!posts) return <Blocks lang={lang} />;
  if (posts.length === 0) return <Empty lang={lang} tab={tab} filtered={Boolean(type || topic)} />;

  return (
    <>
      <ul className={ideas.list}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            lang={lang}
            post={post}
            now={now}
            onChange={(change) => setPosts((shown) => shown?.map((have) => (have.id === post.id ? { ...have, ...change } : have)) ?? null)}
          />
        ))}
      </ul>
      {more === "failed" && (
        <p className={`${onboarding.error} ${ideas.moreFailed}`} role="alert">
          {t.moreFailed}
        </p>
      )}
      {next !== null && (
        <button
          type="button"
          className={`${landing.ghost} ${ideas.more}`}
          aria-busy={more === "loading" || undefined}
          onClick={() => {
            if (more === "loading") return;
            setMore("loading");
            show(next).then(
              () => setMore("idle"),
              (error: unknown) => !(error instanceof SignedOutError) && setMore("failed"),
            );
          }}
        >
          {t.loadMore}
        </button>
      )}
    </>
  );
}

function Posts({ lang, tab, filter }: { lang: Lang; tab: Tab; filter: FeedFilter }) {
  const t = copy[lang];
  // with a kind or a topic the list is everyone's posts, so it is no longer the For you page
  const query = filterQuery(filter);
  // every tab asks for the profile, so the places bar knows whether to offer Reviews
  const me = useMe();
  // a deleted post sends its author here with ?done=deleted
  const deleted = useSearchParams().get("done") === "deleted";
  // choosing other topics loads the For you list again from the top
  const [loaded, setLoaded] = useState(0);
  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <h1 className={ideas.title}>{t.title}</h1>
      <p className={ideas.lead}>{t.lead}</p>
      <div className={ideas.toolbar}>
        <FeedTabs lang={lang} current={query ? undefined : tab} />
      </div>
      {tab === "mine" && deleted && (
        <p className={ideas.done} role="status">
          <Check />
          {t.deleted}
        </p>
      )}
      <Link className={`${landing.btn} ${ideas.share}`} href={`/${lang}/posts/compose`}>
        {t.write}
      </Link>
      {tab === "for-you" && <FeedFilters lang={lang} filter={filter} />}
      {/* the saved topics are not what a filtered list shows, so their line and its choice wait */}
      {tab === "for-you" && me && !query && <FeedTopics lang={lang} me={me} onSaved={() => setLoaded((n) => n + 1)} />}
      {tab === "mine" ? (
        // your own posts are the ones whose author is you, so they wait for your username
        me ? <PostList lang={lang} tab={tab} username={me.username} filter={filter} /> : <Blocks lang={lang} />
      ) : (
        // another kind or topic is another list: it starts again from its own first page
        <PostList key={`${loaded} ${query}`} lang={lang} tab={tab} filter={filter} />
      )}
    </main>
  );
}

// The Developer Exchange: what developers share, as three lists (for you, saved, yours).
export function Feed({ lang, tab }: { lang: Lang; tab: Tab }) {
  const params = useSearchParams();
  // a kind or a topic in the address narrows the first list only: Saved and Yours take neither
  const filter = tab === "for-you" ? readFilter(params) : {};
  // the language link keeps the kind and the topic
  const query = filterQuery(filter);
  return (
    <AppFrame lang={lang} path={query ? `${PATHS[tab]}?${query}` : PATHS[tab]}>
      <RequireSession lang={lang} fallback={<FeedSkeleton label={copy[lang].loading} />}>
        <Posts lang={lang} tab={tab} filter={filter} />
      </RequireSession>
    </AppFrame>
  );
}
