"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { Person } from "../hubs/team";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Bookmark, Heart, MessageCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { TECHNOLOGIES } from "../onboarding/options";
import { waited } from "../reviews/queue";
import { SignedOutError } from "../session/session";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { setMark, type Post } from "./feed-api";
import { feedHref } from "./feed-filter";
import styles from "./feed.module.css";
import { isDemoRefusal, NotSaved } from "./not-saved";

const MONTH = 30 * 24 * 60 * 60 * 1000;

// "3 hours ago" for a recent moment, a date once it is older: "400 days ago" says little.
export function when(iso: string, now: number, lang: Lang): string {
  if (now - Date.parse(iso) >= MONTH) return new Date(iso).toLocaleDateString(lang, { dateStyle: "medium" });
  return fill(copy[lang].ago, { time: waited(iso, now, lang) });
}

// Who wrote it, when, and the kind of post unless it is a plain one. The kind leads to the feed's
// posts of that kind, except a hub's milestone, which nobody writes and the feed does not filter by.
export function PostHead({ lang, post, now }: { lang: Lang; post: Post; now: number }) {
  const t = copy[lang];
  return (
    <div className={styles.head}>
      <Person lang={lang} user={post.author} />
      <p className={styles.when}>
        <time dateTime={post.created_at}>{when(post.created_at, now, lang)}</time>
        {post.type === "hub_milestone" ? (
          <span className={village.pill} data-state="open">
            {t.types[post.type]}
          </span>
        ) : (
          post.type !== "general" && (
            <Link
              className={`${village.pill} ${styles.kindLink}`}
              data-state="open"
              href={feedHref(lang, { type: post.type })}
              aria-label={fill(t.filter.seeKind, { kind: t.types[post.type] })}
            >
              {t.types[post.type]}
            </Link>
          )
        )}
      </p>
    </div>
  );
}

// Plain text with its line breaks kept. A post is never rendered as markup, and in a list it is
// cut short. With an `href` (a post that has no title) the first line is the link to the post.
export function PostBody({ post, clamp, href }: { post: Post; clamp?: boolean; href?: string }) {
  const [first, ...rest] = post.body.trimStart().split("\n");
  return (
    <p className={styles.body} data-clamp={clamp || undefined}>
      {href ? (
        <>
          <Link href={href}>{first}</Link>
          {rest.length > 0 && `\n${rest.join("\n")}`}
        </>
      ) : (
        post.body
      )}
    </p>
  );
}

// The API only checks that a link starts with http:// or https://, so a link that is not a
// real address shows as it was written instead of breaking the page.
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// The post's link, shown as its host name.
export function PostLink({ lang, url }: { lang: Lang; url: string }) {
  return (
    <p className={styles.link}>
      <a href={url} target="_blank" rel="noopener noreferrer">
        {hostOf(url)} <span className={landing.srOnly}>({copy[lang].opensNewTab})</span>
      </a>
    </p>
  );
}

// Each topic leads to the feed's posts on it. `plain` keeps them as text, for a form that must not
// be left by accident, and so does a topic the app has no name for: the feed could not filter by it.
export function PostTopics({ lang, topics, plain }: { lang: Lang; topics: Post["topics"]; plain?: boolean }) {
  if (topics.length === 0) return null;
  return (
    <ul className={village.tags}>
      {topics.map((topic) => {
        const known = TECHNOLOGIES.find((tech) => tech.slug === topic.slug)?.name[lang];
        return known && !plain ? (
          <li key={topic.slug}>
            <Link
              className={`${onboarding.chip} ${styles.topicLink}`}
              href={feedHref(lang, { topic: topic.slug })}
              aria-label={fill(copy[lang].filter.seeTopic, { topic: known })}
            >
              {known}
            </Link>
          </li>
        ) : (
          <li key={topic.slug} className={village.tag}>
            {known ?? topic.name}
          </li>
        );
      })}
    </ul>
  );
}

// Like, save and the number of comments. A press changes the screen at once through
// `onChange`, then sends the request; if it fails the change is taken back and a sentence says so.
export function PostActions({ lang, post, onChange, commentsHref }: { lang: Lang; post: Post; onChange: (change: Partial<Post>) => void; commentsHref?: string }) {
  const t = copy[lang];
  // a second press of the same button while its request is out would send the same thing twice
  const sending = useRef(new Set<"like" | "save">());
  const [failed, setFailed] = useState<"like" | "save" | "demo" | null>(null);

  function toggle(mark: "like" | "save") {
    if (sending.current.has(mark)) return;
    sending.current.add(mark);
    setFailed(null);
    const on = mark === "like" ? !post.liked_by_me : !post.saved_by_me;
    const [change, undo]: Partial<Post>[] =
      mark === "like"
        ? [
            { liked_by_me: on, like_count: post.like_count + (on ? 1 : -1) },
            { liked_by_me: post.liked_by_me, like_count: post.like_count },
          ]
        : [{ saved_by_me: on }, { saved_by_me: post.saved_by_me }];
    onChange(change);
    setMark(post.id, mark, on)
      .catch((error: unknown) => {
        // a refused session is handled by the page: it sends the person to sign in
        if (error instanceof SignedOutError) return;
        onChange(undo);
        // in the demo "try again" would be wrong
        setFailed(isDemoRefusal(error) ? "demo" : mark);
      })
      .finally(() => sending.current.delete(mark));
  }

  const comments = new Intl.PluralRules(lang).select(post.comment_count) === "one" ? t.commentOne : t.commentMany;
  const count = (
    <>
      <MessageCircle />
      <span className={styles.count} aria-hidden="true">
        {post.comment_count}
      </span>
      <span className={landing.srOnly}>{fill(comments, { n: post.comment_count })}</span>
    </>
  );
  return (
    <>
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.action} ${styles.like}`}
          aria-pressed={post.liked_by_me}
          aria-label={fill(t.likeCount, { n: post.like_count })}
          onClick={() => toggle("like")}
        >
          <Heart />
          <span className={styles.count}>{post.like_count}</span>
        </button>
        <button type="button" className={styles.action} aria-pressed={post.saved_by_me} onClick={() => toggle("save")}>
          <Bookmark />
          {t.save}
        </button>
        {commentsHref ? (
          <Link className={styles.comments} href={commentsHref}>
            {count}
          </Link>
        ) : (
          <span className={styles.comments}>{count}</span>
        )}
      </div>
      {failed === "demo" && <NotSaved lang={lang} />}
      {(failed === "like" || failed === "save") && (
        <p className={onboarding.error} role="alert">
          <AlertCircle />
          {failed === "like" ? t.likeFailed : t.saveFailed}
        </p>
      )}
    </>
  );
}
