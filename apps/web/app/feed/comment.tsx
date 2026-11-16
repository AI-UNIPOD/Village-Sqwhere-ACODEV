"use client";

import { createContext, useContext, useState } from "react";

import { authorName } from "../ideas/browse";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, Heart } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { CommentForm, type Problem } from "./comment-form";
import type { Thread } from "./comment-tree";
import styles from "./comments.module.css";
import { copy } from "./copy";
import type { PostComment } from "./feed-api";
import feed from "./feed.module.css";
import { NotSaved } from "./not-saved";
import { when } from "./post-parts";

// The one form that is open at a time, under a comment: a reply to it or an edit of it.
export type Open = { id: string; mode: "reply" | "edit" };

// What the comments on the page share, so that a comment deep in a thread needs no long list of props.
export type Tools = {
  lang: Lang;
  now: number;
  username: string | undefined;
  /** The comment whose like was refused for the demo account. */
  unsaved: string | null;
  open: Open | null;
  setOpen: (open: Open | null) => void;
  arrived: string | null;
  reply: (to: PostComment, text: string) => Promise<Problem | null>;
  edit: (target: PostComment, text: string) => Promise<Problem | null>;
  like: (target: PostComment) => void;
  ask: (target: PostComment) => void;
  showReplies: (from: Thread) => Promise<boolean>;
  openThread: (from: Thread) => void;
};

export const ToolsContext = createContext<Tools | null>(null);

// Replies stop moving right after this level, so a long thread still fits a phone.
const INDENTED_LEVELS = 3;

const initials = (author: NonNullable<PostComment["author"]>) =>
  (author.display_name === author.username ? author.username : author.display_name)
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function Byline({ tools, comment }: { tools: Tools; comment: PostComment }) {
  const t = copy[tools.lang].comments;
  const author = comment.author!;
  return (
    <div className={styles.byline}>
      <span className={styles.avatar} aria-hidden="true">
        {initials(author)}
      </span>
      <span className={styles.name}>
        {authorName(author)}
        {author.is_verified && (
          <span className={styles.verified}>
            <Check />
            <span className={landing.srOnly}>{t.verified}</span>
          </span>
        )}
      </span>
      <span className={styles.when}>
        <time dateTime={comment.created_at}>{when(comment.created_at, tools.now, tools.lang)}</time>
        {comment.edited_at && <span>{t.edited}</span>}
      </span>
    </div>
  );
}

// One comment and everything under it: its replies, each one a comment of the same kind.
// `level` counts from 1 at the top, and `to` is the comment it answers, if it is a reply.
export function CommentThread({ item, level, to }: { item: Thread; level: number; to?: PostComment }) {
  const tools = useContext(ToolsContext)!;
  const { lang, open, setOpen } = tools;
  const t = copy[lang].comments;
  const comment = item.comment;
  const [replies, setReplies] = useState<"idle" | "loading" | "failed">("idle");

  const author = comment.author;
  const mine = !!author && author.username === tools.username;
  const form = open?.id === comment.id ? open.mode : null;
  const replyButton = `comment-${comment.id}-reply`;
  const editButton = `comment-${comment.id}-edit`;

  // closing a form puts the person back on the button that opened it
  function close(button: string) {
    setOpen(null);
    document.getElementById(button)?.focus();
  }

  function toggle(mode: "reply" | "edit") {
    setOpen(form === mode ? null : { id: comment.id, mode });
  }

  function showReplies() {
    if (replies === "loading") return;
    setReplies("loading");
    tools.showReplies(item).then((ok) => setReplies(ok ? "idle" : "failed"));
  }

  // a reply that no longer moves right opens what is under it on its own, so that indents again
  const continues = level > INDENTED_LEVELS && item.replies.length === 0;
  const n = comment.reply_count;
  const showLabel =
    item.offset > 0 ? t.showMore : item.replies.length > 0 ? fill(t.showAll, { n }) : n === 1 ? t.showOne : fill(t.showSome, { n });

  return (
    <li id={`comment-${comment.id}`} className={styles.item} tabIndex={-1} data-arrived={tools.arrived === comment.id || undefined}>
      {comment.deleted || !author ? (
        <p className={styles.gone}>{t.deleted}</p>
      ) : (
        <>
          <Byline tools={tools} comment={comment} />
          {to?.author && level > INDENTED_LEVELS && <p className={styles.answering}>{fill(t.inReply, { name: authorName(to.author) })}</p>}
          {form === "edit" ? (
            <CommentForm
              lang={lang}
              id={`comment-${comment.id}-editing`}
              label={t.editLabel}
              action={t.save}
              initial={comment.body ?? ""}
              onCancel={() => close(editButton)}
              onSend={async (text) => {
                const problem = await tools.edit(comment, text);
                if (!problem) close(editButton);
                return problem;
              }}
            />
          ) : (
            <p className={feed.body}>{comment.body}</p>
          )}
          <div className={feed.actions}>
            <button
              type="button"
              className={`${feed.action} ${feed.like}`}
              aria-pressed={comment.liked_by_me}
              aria-label={fill(copy[lang].likeCount, { n: comment.like_count })}
              onClick={() => tools.like(comment)}
            >
              <Heart />
              <span className={feed.count}>{comment.like_count}</span>
            </button>
            <button
              type="button"
              id={replyButton}
              className={feed.action}
              aria-label={fill(t.replyTo, { name: authorName(author) })}
              aria-expanded={form === "reply"}
              aria-controls={form === "reply" ? `comment-${comment.id}-replying-form` : undefined}
              onClick={() => toggle("reply")}
            >
              {t.reply}
            </button>
            {mine && (
              <>
                <button
                  type="button"
                  id={editButton}
                  className={feed.action}
                  aria-expanded={form === "edit"}
                  aria-controls={form === "edit" ? `comment-${comment.id}-editing-form` : undefined}
                  onClick={() => toggle("edit")}
                >
                  {t.edit}
                </button>
                <button type="button" className={feed.action} onClick={() => tools.ask(comment)}>
                  {t.delete}
                </button>
              </>
            )}
          </div>
          {tools.unsaved === comment.id && <NotSaved lang={lang} />}
          {form === "reply" && (
            <CommentForm
              lang={lang}
              id={`comment-${comment.id}-replying`}
              label={fill(t.replyTo, { name: authorName(author) })}
              action={t.reply}
              onCancel={() => close(replyButton)}
              onSend={async (text) => {
                const problem = await tools.reply(comment, text);
                if (!problem) close(replyButton);
                return problem;
              }}
            />
          )}
        </>
      )}
      {(item.replies.length > 0 || item.more) && (
        <div className={styles.replies} data-flat={level >= INDENTED_LEVELS || undefined}>
          {item.replies.length > 0 && (
            <ul className={styles.list}>
              {item.replies.map((reply) => (
                <CommentThread key={reply.comment.id} item={reply} level={level + 1} to={comment.author ? comment : undefined} />
              ))}
            </ul>
          )}
          {item.more &&
            (continues ? (
              <button type="button" className={`${landing.ghost} ${styles.show}`} onClick={() => tools.openThread(item)}>
                {t.continueThread}
              </button>
            ) : (
              <button type="button" className={`${landing.ghost} ${styles.show}`} aria-busy={replies === "loading" || undefined} onClick={showReplies}>
                {showLabel}
              </button>
            ))}
          {replies === "failed" && (
            <p className={`${onboarding.error} ${ideas.moreFailed}`} role="alert">
              <AlertCircle />
              {t.repliesFailed}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
