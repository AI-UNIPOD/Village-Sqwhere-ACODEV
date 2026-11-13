"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import { Field, useLeaveWarning } from "../ideas/composer";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { TECHNOLOGIES } from "../onboarding/options";
import { useMe } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { copy } from "./copy";
import { createPost, KINDS, loadPost, POST_LIMITS, toFields, updatePost, type Post, type PostFields } from "./feed-api";
import { FeedSkeleton } from "./feed";
import styles from "./feed.module.css";
import { Gone } from "./post-page";
import { PostTopics } from "./post-parts";

const EMPTY: PostFields = { kind: "general", title: "", body: "", link: "", topics: [] };

type Problem = "kind" | "title" | "body" | "link" | "topics";
type Errors = Partial<Record<Problem, string>>;

// The rules the API checks, so most refusals are said before anything is sent. The body is
// measured as typed, the title and the link without the spaces around them, as the API does.
function validate(fields: PostFields, t: (typeof copy)[Lang]["compose"]["errors"]): Errors {
  const errors: Errors = {};
  const title = fields.title.trim().length;
  const link = fields.link.trim();
  if (fields.body.trim() === "") errors.body = t.bodyEmpty;
  else if (fields.body.length > POST_LIMITS.bodyMax) errors.body = t.bodyLong;
  if (title > POST_LIMITS.titleMax) errors.title = t.titleLong;
  else if (title === 0 && fields.kind === "rfc") errors.title = t.titleRfc;
  if (link && !/^https?:\/\//.test(link)) errors.link = t.linkBad;
  else if (link.length > POST_LIMITS.linkMax) errors.link = t.linkLong;
  return errors;
}

// The API's answer to a refused post, as the sentence for the field it is about.
function refusal(error: IdeaError, t: (typeof copy)[Lang]["compose"]["errors"]): Errors | null {
  switch (error.code) {
    case "UNKNOWN_TOPIC":
      return { topics: t.unknownTopic };
    case "TOO_MANY_TOPICS":
      return { topics: t.tooManyTopics };
    case "DUPLICATE_TOPICS":
      return { topics: t.duplicateTopics };
    case "HUB_MILESTONE_NOT_SUPPORTED":
      return { kind: t.hubMilestone };
    case "RFC_TITLE_REQUIRED":
      return { title: t.titleRfc };
    case "INVALID":
      // a field the page did not catch, such as a null character
      return error.field === "title" ? { title: t.refused } : error.field === "body" ? { body: t.refused } : error.field === "link_url" ? { link: t.refused } : null;
    default:
      return null;
  }
}

const FIELD_IDS: Record<Problem, string> = { kind: "post-kind", title: "post-title", body: "post-body", link: "post-link", topics: "post-topics" };

function Composer({ lang, id }: { lang: Lang; id: string | null }) {
  const t = copy[lang];
  const c = t.compose;
  const router = useRouter();
  const me = useMe();
  // undefined while the post to edit loads, null for a new post or one that is gone
  const [saved, setSaved] = useState<Post | null | undefined>(id ? undefined : null);
  const [missing, setMissing] = useState(false);
  const [foreign, setForeign] = useState(false);
  const [loadFailure, setLoadFailure] = useState<Error | null>(null);
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!id || saved !== undefined) return;
    let live = true;
    loadPost(id).then(
      (post) => {
        if (!live) return;
        setSaved(post);
        setFields(toFields(post));
      },
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        // an id that is not a post's id at all is refused with 422
        if (error instanceof IdeaError && (error.status === 404 || error.status === 422)) setMissing(true);
        else setLoadFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id, saved]);

  const dirty = JSON.stringify(fields) !== JSON.stringify(saved ? toFields(saved) : EMPTY);
  useLeaveWarning(dirty);

  function change(patch: Partial<PostFields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    setFailed(null);
    // an error that is showing goes the moment the value is fixed; new ones wait for the button
    const found = validate(next, c.errors);
    setErrors((shown) => Object.fromEntries(Object.entries(shown).filter(([key]) => found[key as Problem])));
  }

  function toggle(slug: string) {
    const on = fields.topics.includes(slug);
    if (!on && fields.topics.length >= POST_LIMITS.topicsMax) return;
    change({ topics: on ? fields.topics.filter((other) => other !== slug) : [...fields.topics, slug] });
  }

  // true when the post can be sent; otherwise it shows why and moves to the first problem
  function ready() {
    const found = validate(fields, c.errors);
    setErrors(found);
    const first = (["title", "body", "link"] as const).find((key) => found[key]);
    if (first) document.getElementById(FIELD_IDS[first])?.focus();
    return !first;
  }

  function fail(error: unknown) {
    if (error instanceof SignedOutError) return;
    const found = error instanceof IdeaError ? refusal(error, c.errors) : null;
    if (error instanceof IdeaError && error.status === 404) setMissing(true);
    else if (error instanceof IdeaError && error.code === "NOT_POST_AUTHOR") setForeign(true);
    else if (found) setErrors(found);
    else if (error instanceof IdeaError && error.code === "EMPTY_UPDATE") setFailed(c.errors.nothingChanged);
    else setFailed(saved ? c.errors.save : c.errors.publish);
  }

  // One request at a time: a second press while it is out does nothing.
  async function send() {
    if (busy || !ready()) return;
    setBusy(true);
    setFailed(null);
    try {
      if (saved) {
        // the app keeps this page, so it must hold the post as it now is
        const post = await updatePost(fields, saved);
        setSaved(post);
        setFields(toFields(post));
        router.push(`/${lang}/posts/view?id=${encodeURIComponent(post.id)}&done=saved`);
      } else {
        const post = await createPost(fields);
        // and a new post must not be left in a form that could send it again
        setFields(EMPTY);
        router.push(`/${lang}/posts/view?id=${encodeURIComponent(post.id)}&done=published`);
      }
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  if (loadFailure) throw loadFailure;
  if (missing) return <Gone lang={lang} />;
  if (saved === undefined || (id && !me)) return <FeedSkeleton label={t.post.loading} />;
  if (saved && (foreign || me?.username !== saved.author.username)) {
    return (
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{c.notYours.title}</h1>
        <p className={onboarding.why}>{c.notYours.text}</p>
        <div className={onboarding.actions}>
          <Link className={landing.btn} href={`/${lang}/posts/view?id=${encodeURIComponent(saved.id)}`}>
            {c.notYours.action}
          </Link>
        </div>
      </main>
    );
  }

  const describe = (name: "title" | "body" | "link") => `post-${name}-help${errors[name] ? ` post-${name}-error` : ""}`;
  // quiet until the text is within a tenth of its limit
  const count = (length: number, max: number) => (length > max * 0.9 ? fill(c.count, { n: length, max }) : undefined);
  const rfc = fields.kind === "rfc";
  const full = fields.topics.length >= POST_LIMITS.topicsMax;

  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <h1 className={ideas.title}>{saved ? c.editTitle : c.newTitle}</h1>

      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <div className={ideas.field}>
          <p id="post-kind-label" className={ideas.label}>
            {c.kindLabel}
          </p>
          {saved ? (
            <>
              <p>{fields.kind === "general" ? c.general : t.types[fields.kind]}</p>
              <p className={ideas.help}>{c.fixedKind}</p>
            </>
          ) : (
            <div id="post-kind" role="radiogroup" aria-labelledby="post-kind-label" className={styles.kinds}>
              {KINDS.map((kind) => (
                <label key={kind} className={onboarding.choice}>
                  <input type="radio" name="post-kind" value={kind} checked={fields.kind === kind} onChange={() => change({ kind })} />
                  <span className={onboarding.choiceText}>
                    <span className={onboarding.choiceName}>{kind === "general" ? c.general : t.types[kind]}</span>
                    <span className={onboarding.choiceHint}>{c.hints[kind]}</span>
                  </span>
                  <Check className={onboarding.tick} />
                </label>
              ))}
            </div>
          )}
          {errors.kind && (
            <p className={onboarding.error} role="alert">
              <AlertCircle />
              {errors.kind}
            </p>
          )}
        </div>

        <Field
          id="post-title"
          label={
            <>
              {c.title.label} <span className={styles.optional}>({rfc ? c.title.required : c.title.optional})</span>
            </>
          }
          help={rfc ? c.title.rfcHelp : c.title.help}
          error={errors.title}
          count={count(fields.title.length, POST_LIMITS.titleMax)}
        >
          <input
            id="post-title"
            className={onboarding.input}
            value={fields.title}
            autoComplete="off"
            aria-invalid={!!errors.title || undefined}
            aria-describedby={describe("title")}
            onChange={(event) => change({ title: event.target.value })}
          />
        </Field>

        <Field
          id="post-body"
          label={c.body.label}
          help={c.body.help}
          error={errors.body}
          count={count(fields.body.length, POST_LIMITS.bodyMax)}
        >
          <textarea
            id="post-body"
            className={`${onboarding.input} ${ideas.area} ${styles.bodyArea}`}
            rows={12}
            value={fields.body}
            aria-invalid={!!errors.body || undefined}
            aria-describedby={describe("body")}
            onChange={(event) => change({ body: event.target.value })}
          />
        </Field>

        <Field
          id="post-link"
          label={
            <>
              {c.link.label} <span className={styles.optional}>({c.link.optional})</span>
            </>
          }
          help={c.link.help}
          error={errors.link}
          count={count(fields.link.length, POST_LIMITS.linkMax)}
        >
          <input
            id="post-link"
            className={onboarding.input}
            type="url"
            inputMode="url"
            value={fields.link}
            autoComplete="off"
            aria-invalid={!!errors.link || undefined}
            aria-describedby={describe("link")}
            onChange={(event) => change({ link: event.target.value })}
          />
        </Field>

        <div className={ideas.field}>
          <p id="post-topics-label" className={ideas.label}>
            {c.topics.label} <span className={styles.optional}>({c.topics.optional})</span>
          </p>
          {saved ? (
            <>
              {saved.topics.length > 0 ? <PostTopics lang={lang} topics={saved.topics} /> : <p>{c.noTopics}</p>}
              <p className={ideas.help}>{c.fixedTopics}</p>
            </>
          ) : (
            <>
              <div id="post-topics" role="group" aria-labelledby="post-topics-label" aria-describedby="post-topics-help" className={onboarding.chips}>
                {TECHNOLOGIES.map((tech) => {
                  const on = fields.topics.includes(tech.slug);
                  return (
                    <button
                      key={tech.slug}
                      type="button"
                      className={`${onboarding.chip} ${styles.chip}`}
                      aria-pressed={on}
                      aria-disabled={(full && !on) || undefined}
                      onClick={() => toggle(tech.slug)}
                    >
                      {tech.name[lang]}
                    </button>
                  );
                })}
              </div>
              <p id="post-topics-help" className={ideas.help}>
                {full ? c.topics.full : c.topics.help}
              </p>
            </>
          )}
          {errors.topics && (
            <p className={onboarding.error} role="alert">
              <AlertCircle />
              {errors.topics}
            </p>
          )}
        </div>

        <div className={`${onboarding.actions} ${onboarding.questionActions} ${ideas.bar}`}>
          {failed && (
            <p className={`${onboarding.error} ${ideas.failed}`} role="alert">
              <AlertCircle />
              {failed}
            </p>
          )}
          <button type="submit" className={landing.btn} aria-busy={busy || undefined}>
            {saved ? c.saveChanges : c.publish}
          </button>
          <Link className={landing.ghost} href={saved ? `/${lang}/posts/view?id=${encodeURIComponent(saved.id)}` : `/${lang}/feed`}>
            {c.cancel}
          </Link>
        </div>
      </form>
    </main>
  );
}

// Where a developer writes a post: new without an id in the address, an existing one with it.
export function PostComposer({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  return (
    <AppFrame lang={lang} path={`posts/compose${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<FeedSkeleton label={copy[lang].post.loading} />}>
        {/* another post is another form: nothing typed for one may be sent as the next */}
        <Composer key={id ?? "new"} lang={lang} id={id} />
      </RequireSession>
    </AppFrame>
  );
}

// The whole page while it loads, for the route's Suspense boundary.
export function ComposeLoading({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="posts/compose">
      <FeedSkeleton label={copy[lang].post.loading} />
    </AppFrame>
  );
}
