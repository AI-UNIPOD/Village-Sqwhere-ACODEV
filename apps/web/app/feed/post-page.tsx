"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import { ConfirmDialog } from "../confirm-dialog";
import { authorName } from "../ideas/browse";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, ArrowLeft } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { useMe } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { copy } from "./copy";
import { deletePost, loadPost, type Post } from "./feed-api";
import { FeedSkeleton } from "./feed";
import styles from "./feed.module.css";
import { PostActions, PostBody, PostHead, PostLink, PostTopics, when } from "./post-parts";

// The whole page while it loads, for the route's Suspense boundary.
export function PostLoading({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="posts/view">
      <FeedSkeleton label={copy[lang].post.loading} />
    </AppFrame>
  );
}

// A post that is not there: deleted, or an address with no real post in it.
function Gone({ lang }: { lang: Lang }) {
  const t = copy[lang].post;
  return (
    <main className={`${onboarding.column} ${onboarding.step}`}>
      <h1 className={onboarding.title}>{t.goneTitle}</h1>
      <p className={onboarding.why}>{t.goneText}</p>
      <div className={onboarding.actions}>
        <Link className={landing.btn} href={`/${lang}/feed`}>
          {t.goneAction}
        </Link>
      </div>
    </main>
  );
}

function PostView({ lang, id }: { lang: Lang; id: string | null }) {
  const t = copy[lang];
  const router = useRouter();
  const me = useMe();
  // undefined while loading, null when there is no such post (or the address has no id)
  const [post, setPost] = useState<Post | null | undefined>(id ? undefined : null);
  const [now] = useState(() => Date.now());
  const [failure, setFailure] = useState<Error | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    loadPost(id).then(
      (found) => live && setPost(found),
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        // an id that is not a post's id at all is refused with 422
        if (error instanceof IdeaError && (error.status === 404 || error.status === 422)) setPost(null);
        else setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id]);

  function remove() {
    if (!id || deleting) return;
    setDeleting(true);
    setProblem(null);
    deletePost(id).then(
      () => {
        // the app keeps this page: it must show a deleted post as gone if it is opened again
        setPost(null);
        router.push(`/${lang}/feed/mine?done=deleted`);
      },
      (error: unknown) => {
        setDeleting(false);
        setConfirming(false);
        if (error instanceof SignedOutError) return;
        if (error instanceof IdeaError && error.status === 404) setPost(null);
        else setProblem(error instanceof IdeaError && error.code === "NOT_POST_AUTHOR" ? t.post.notAuthor : t.post.deleteFailed);
      },
    );
  }

  if (failure) throw failure;
  if (post === null) return <Gone lang={lang} />;
  if (!post) return <FeedSkeleton label={t.post.loading} />;

  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <Link className={`${onboarding.back} ${ideas.backLink}`} href={`/${lang}/feed`}>
        <ArrowLeft />
        {t.post.back}
      </Link>
      <h1 className={ideas.title}>{post.title ?? fill(t.postBy, { name: authorName(post.author) })}</h1>
      <div className={styles.page}>
        <PostHead lang={lang} post={post} now={now} />
        {post.edited_at && <p className={ideas.meta}>{fill(t.post.edited, { time: when(post.edited_at, now, lang) })}</p>}
        <PostBody post={post} />
        {post.link_url && <PostLink lang={lang} url={post.link_url} />}
        <PostTopics lang={lang} topics={post.topics} />
        <PostActions lang={lang} post={post} onChange={(change) => setPost((have) => have && { ...have, ...change })} />
        <p className={ideas.meta}>{t.post.commentsSoon}</p>
        {me?.username === post.author.username && (
          <div>
            <button type="button" className={landing.ghost} onClick={() => setConfirming(true)}>
              {t.post.delete}
            </button>
            {problem && (
              <p className={onboarding.error} role="alert">
                <AlertCircle />
                {problem}
              </p>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title={t.post.deleteConfirm.title}
        confirm={t.post.deleteConfirm.confirm}
        cancel={t.post.deleteConfirm.cancel}
        danger
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      >
        {t.post.deleteConfirm.text}
      </ConfirmDialog>
    </main>
  );
}

// One post, whole: its full text, who wrote it and the same like and save as the list.
export function PostPage({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  return (
    <AppFrame lang={lang} path={`posts/view${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<FeedSkeleton label={copy[lang].post.loading} />}>
        <PostView key={id ?? "none"} lang={lang} id={id} />
      </RequireSession>
    </AppFrame>
  );
}
