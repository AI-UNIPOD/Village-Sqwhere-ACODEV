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
import styles from "./feed.module.css";

const MONTH = 30 * 24 * 60 * 60 * 1000;

// "3 hours ago" for a recent moment, a date once it is older: "400 days ago" says little.
export function when(iso: string, now: number, lang: Lang): string {
  if (now - Date.parse(iso) >= MONTH) return new Date(iso).toLocaleDateString(lang, { dateStyle: "medium" });
  return fill(copy[lang].ago, { time: waited(iso, now, lang) });
}

// Who wrote it, when, and the kind of post unless it is a plain one.
export function PostHead({ lang, post, now }: { lang: Lang; post: Post; now: number }) {
  return (
    <div className={styles.head}>
      <Person lang={lang} user={post.author} />
      <p className={styles.when}>
        <time dateTime={post.created_at}>{when(post.created_at, now, lang)}</time>
        {post.type !== "general" && (
          <span className={village.pill} data-state="open">
            {copy[lang].types[post.type]}
          </span>
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

export function PostTopics({ lang, topics }: { lang: Lang; topics: Post["topics"] }) {
  if (topics.length === 0) return null;
  return (
    <ul className={village.tags}>
      {topics.map((topic) => (
        <li key={topic.slug} className={village.tag}>
          {TECHNOLOGIES.find((known) => known.slug === topic.slug)?.name[lang] ?? topic.name}
        </li>
      ))}
    </ul>
  );
}

// Like, save and the number of comments. A press changes the screen at once through
// `onChange`, then sends the request; if it fails the change is taken back and a sentence says so.
export function PostActions({ lang, post, onChange, commentsHref }: { lang: Lang; post: Post; onChange: (change: Partial<Post>) => void; commentsHref?: string }) {
  const t = copy[lang];
  // a second press of the same button while its request is out would send the same thing twice
  const sending = useRef(new Set<"like" | "save">());
  const [failed, setFailed] = useState<"like" | "save" | null>(null);

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
        setFailed(mark);
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
      {failed && (
        <p className={onboarding.error} role="alert">
          <AlertCircle />
          {failed === "like" ? t.likeFailed : t.saveFailed}
        </p>
      )}
    </>
  );
}
