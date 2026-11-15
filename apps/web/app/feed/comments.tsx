"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, ArrowLeft } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { useMe } from "../session/me";
import { SignedOutError } from "../session/session";
import { CommentForm, type Problem } from "./comment-form";
import { change, fromList, fromThread, place, thread, type Thread } from "./comment-tree";
import { CommentThread, ToolsContext, type Open, type Tools } from "./comment";
import styles from "./comments.module.css";
import { copy } from "./copy";
import { createComment, deleteComment, loadComments, loadReplies, loadThread, setCommentLike, updateComment, type PostComment } from "./feed-api";

type What = "comment" | "reply" | "edit";

// Blocks where the comments will be, while they load.
function Blocks({ label }: { label: string }) {
  return (
    <div aria-busy="true">
      <p className={landing.srOnly} role="status">
        {label}
      </p>
      <div className={onboarding.skeleton} aria-hidden="true">
        <div className={onboarding.block} />
        <div className={onboarding.block} />
        <div className={onboarding.spinner} />
      </div>
    </div>
  );
}

// The comments on a post, loaded on their own after the post: if they cannot load, the post stays.
// `onCount` moves the post's comment count when a comment is added or deleted, and `onGone` says
// the post itself is gone.
export function Comments({ lang, postId, count, onCount, onGone }: { lang: Lang; postId: string; count: number; onCount: (by: number) => void; onGone: () => void }) {
  const t = copy[lang];
  const c = t.comments;
  const me = useMe();
  // read once per visit, so every comment counts from the same moment
  const [now] = useState(() => Date.now());
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  const [open, setOpen] = useState<Open | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [said, setSaid] = useState({ text: "", n: 0 });
  const [asking, setAsking] = useState<PostComment | null>(null);
  const [deleting, setDeleting] = useState(false);
  // the comment whose thread is shown on its own, in place of all the comments
  const [focus, setFocus] = useState<string | null>(null);
  // what is shown now, for a page that arrives after the person moved to the other
  const viewing = useRef<string | null>(null);
  // an element to bring into view, or to give focus, once the change that makes it exists is on screen
  const reveal = useRef<{ element: string; focus?: boolean } | null>(null);

  useEffect(() => {
    if (!reveal.current) return;
    const element = document.getElementById(reveal.current.element);
    element?.scrollIntoView?.({ block: "nearest" });
    if (reveal.current.focus) element?.focus();
    reveal.current = null;
  });

  const say = (text: string) => setSaid((have) => ({ text, n: have.n + 1 }));

  // A page of all the comments, or of the thread that is open on its own.
  const show = useCallback(
    (offset: number) => {
      const asked = focus;
      const shown = (next: number | null, added: (have: Thread[]) => Thread[]) => {
        if (viewing.current !== asked) return;
        setThreads((have) => added(offset === 0 ? [] : (have ?? [])));
        setNext(next);
      };
      return asked
        ? loadThread(asked, offset).then((page) => shown(page.next_offset, (have) => fromThread(have, page.data)))
        : loadComments(postId, offset).then((page) => shown(page.next_offset, (have) => (offset === 0 ? fromList(page.data) : place(have, fromList(page.data)))));
    },
    [postId, focus],
  );

  // also when the app shows this page again: a comment written elsewhere in the meantime is in it
  useEffect(() => {
    let live = true;
    show(0).catch((error: unknown) => {
      if (!live || error instanceof SignedOutError) return;
      if (error instanceof IdeaError && error.code === "POST_NOT_FOUND") onGone();
      else if (error instanceof IdeaError && error.code === "COMMENT_NOT_FOUND") {
        // the thread's comment was deleted: all the comments load again, with a note that says why
        viewing.current = null;
        setFocus(null);
        setNotice(copy[lang].comments.errors.gone);
      } else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [show, attempt, onGone, lang]);

  // Shows one comment's thread on its own, or all the comments again with null. Either loads fresh.
  function view(id: string | null) {
    viewing.current = id;
    setFocus(id);
    setThreads(null);
    setNext(null);
    setFailed(false);
    setMore("idle");
    setOpen(null);
    setArrived(null);
    setNotice(null);
    reveal.current = { element: "comments-heading", focus: true };
  }

  // A link from the feed's comment count lands here. It goes once the section exists and again
  // once the comments are in, because the page is only tall enough to reach this far by then.
  const arrivedAt = threads !== null || failed;
  useEffect(() => {
    if (window.location.hash === "#comments") document.getElementById("comments")?.scrollIntoView?.();
  }, [arrivedAt]);

  // A comment that was deleted while the person had it open: say so and show what is there now.
  function missing() {
    // in a thread on its own, all the comments load again
    if (focus) view(null);
    else show(0).catch(() => setFailed(true));
    setOpen(null);
    setArrived(null);
    setNotice(c.errors.gone);
    reveal.current = { element: "comments-notice" };
  }

  // The sentence for a refused or failed write, and what else the page must do about it.
  function refused(error: unknown, what: What): Problem {
    if (error instanceof SignedOutError) return {};
    if (error instanceof IdeaError) {
      if (error.code === "POST_NOT_FOUND") {
        onGone();
        return {};
      }
      if (error.code === "COMMENT_NOT_FOUND" || error.code === "PARENT_NOT_FOUND") {
        missing();
        return {};
      }
      if (error.code === "MAX_DEPTH_EXCEEDED") return { failed: c.errors.depth };
      if (error.code === "NOT_COMMENT_AUTHOR") return { failed: c.errors.notAuthor };
      // the text itself was turned down, such as one with a null character
      if (error.code === "INVALID" && error.field === "body") return { field: c.errors.refused };
    }
    return { failed: c.errors[what] };
  }

  async function reply(to: PostComment | null, text: string): Promise<Problem | null> {
    setNotice(null);
    try {
      const made = await createComment(postId, text, to?.id);
      const added = thread(made);
      setThreads((have) =>
        to
          ? change(have ?? [], to.id, (found) => ({ ...found, comment: { ...found.comment, reply_count: found.comment.reply_count + 1 }, replies: place(found.replies, [added]) }))
          : place(have ?? [], [added]),
      );
      setArrived(made.id);
      reveal.current = { element: `comment-${made.id}` };
      onCount(1);
      say(to ? c.said.replied : c.said.posted);
      return null;
    } catch (error) {
      return refused(error, to ? "reply" : "comment");
    }
  }

  async function edit(target: PostComment, text: string): Promise<Problem | null> {
    setNotice(null);
    // an edit that changes nothing is not sent: it would only mark the comment as edited
    if (text === target.body) return null;
    try {
      const made = await updateComment(target.id, text);
      setThreads((have) => change(have ?? [], target.id, (found) => ({ ...found, comment: made })));
      say(c.said.saved);
      return null;
    } catch (error) {
      return refused(error, "edit");
    }
  }

  // a second press while the first is being sent would send the same thing twice
  const liking = useRef(new Set<string>());

  function like(target: PostComment) {
    if (liking.current.has(target.id)) return;
    liking.current.add(target.id);
    setNotice(null);
    const on = !target.liked_by_me;
    const set = (liked: boolean, count: number) =>
      setThreads((have) => change(have ?? [], target.id, (found) => ({ ...found, comment: { ...found.comment, liked_by_me: liked, like_count: count } })));
    set(on, target.like_count + (on ? 1 : -1));
    setCommentLike(target.id, on)
      .catch((error: unknown) => {
        if (error instanceof SignedOutError) return;
        set(target.liked_by_me, target.like_count);
        // in the demo the frame says why; "try again" would be wrong
        if (error instanceof IdeaError && error.code === "DEMO_READ_ONLY") return;
        setNotice(t.likeFailed);
        reveal.current = { element: "comments-notice" };
      })
      .finally(() => liking.current.delete(target.id));
  }

  async function remove() {
    if (!asking || deleting) return;
    const target = asking;
    setDeleting(true);
    setNotice(null);
    try {
      await deleteComment(target.id);
      // one with replies stays as a note that keeps them reachable, as the API lists it; one without goes
      setThreads((have) =>
        change(have ?? [], target.id, (found) =>
          target.reply_count > 0 ? { ...found, comment: { ...found.comment, deleted: true, author: null, body: null, edited_at: null } } : null,
        ),
      );
      setOpen(null);
      // the thread that was open on its own is gone with it
      if (target.id === focus && target.reply_count === 0) view(null);
      onCount(-1);
      say(c.said.deleted);
      // the comment's own buttons are gone, so focus goes to the heading of the section
      reveal.current = { element: "comments-heading", focus: true };
    } catch (error) {
      if (!(error instanceof SignedOutError)) {
        const code = error instanceof IdeaError ? error.code : "";
        if (code === "POST_NOT_FOUND") onGone();
        else if (code === "COMMENT_NOT_FOUND") missing();
        else {
          setNotice(code === "NOT_COMMENT_AUTHOR" ? c.errors.notAuthor : c.errors.delete);
          reveal.current = { element: "comments-notice" };
        }
      }
    } finally {
      setDeleting(false);
      setAsking(null);
    }
  }

  // Loads the next page of one comment's replies. False means it failed and it said so itself.
  async function showReplies(from: Thread): Promise<boolean> {
    const id = from.comment.id;
    try {
      const page = await loadReplies(id, from.offset);
      const added = page.data.map((reply) => thread(reply));
      setThreads((have) =>
        change(have ?? [], id, (found) => ({ ...found, replies: place(found.replies, added), more: page.next_offset !== null, offset: page.next_offset ?? found.offset })),
      );
      // when this was the last page the button is gone, so focus goes to the first reply it brought
      const first = added.find((reply) => !from.replies.some((have) => have.comment.id === reply.comment.id));
      if (page.next_offset === null && first) reveal.current = { element: `comment-${first.comment.id}`, focus: true };
      return true;
    } catch (error) {
      if (error instanceof SignedOutError) return true;
      if (error instanceof IdeaError && error.code === "POST_NOT_FOUND") onGone();
      else if (error instanceof IdeaError && error.code === "COMMENT_NOT_FOUND") {
        missing();
        return true;
      }
      return false;
    }
  }

  const tools: Tools = { lang, now, username: me?.username, open, setOpen, arrived, reply, edit, like, ask: setAsking, showReplies, openThread: (from) => view(from.comment.id) };
  const heading = count === 0 ? c.none : fill(new Intl.PluralRules(lang).select(count) === "one" ? t.commentOne : t.commentMany, { n: count });

  return (
    <section id="comments" className={styles.section} aria-labelledby="comments-heading">
      <h2 id="comments-heading" className={ideas.heading} tabIndex={-1}>
        {heading}
      </h2>
      <p className={landing.srOnly} role="status">
        {said.text && said.text + (said.n % 2 ? " " : "")}
      </p>
      {focus && (
        <button type="button" className={onboarding.back} onClick={() => view(null)}>
          <ArrowLeft />
          {c.allComments}
        </button>
      )}
      {failed ? (
        <div>
          <p className={onboarding.error} role="alert">
            <AlertCircle />
            {c.loadFailed}
          </p>
          <button
            type="button"
            className={`${landing.ghost} ${onboarding.retry}`}
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            {t.retry}
          </button>
        </div>
      ) : !threads ? (
        <Blocks label={c.loading} />
      ) : (
        <>
          {!focus && (
            <>
              {threads.length === 0 && <p className={ideas.meta}>{c.noneText}</p>}
              <CommentForm lang={lang} id="new-comment" label={c.write} action={c.post} main onSend={(text) => reply(null, text)} />
            </>
          )}
          {notice && (
            <p id="comments-notice" className={onboarding.error} role="alert">
              <AlertCircle />
              {notice}
            </p>
          )}
          <ToolsContext value={tools}>
            {threads.length > 0 && (
              <ul className={styles.list}>
                {threads.map((item) => (
                  <CommentThread key={item.comment.id} item={item} level={1} />
                ))}
              </ul>
            )}
          </ToolsContext>
          {more === "failed" && (
            <p className={`${onboarding.error} ${ideas.moreFailed}`} role="alert">
              <AlertCircle />
              {c.moreFailed}
            </p>
          )}
          {next !== null && (
            <button
              type="button"
              className={`${landing.ghost} ${styles.show}`}
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
              {c.more}
            </button>
          )}
        </>
      )}
      <ConfirmDialog
        open={!!asking}
        title={c.deleteConfirm.title}
        confirm={c.deleteConfirm.confirm}
        cancel={c.deleteConfirm.cancel}
        danger
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setAsking(null)}
      >
        <p>{c.deleteConfirm.text}</p>
        {asking && asking.reply_count > 0 && <p>{c.deleteConfirm.withReplies}</p>}
      </ConfirmDialog>
    </section>
  );
}
