"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AppFrame } from "../app-frame";
import { ConfirmDialog } from "../confirm-dialog";
import { isDemoRefusal, notSaved } from "../demo-refusal";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, ArrowLeft, Check, Lock } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { ROLES } from "../onboarding/options";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { copy } from "./copy";
import {
  IdeaError,
  LIMITS,
  STAGES,
  closeIdea,
  loadMyIdea,
  publishIdea,
  saveIdea,
  toFields,
  type IdeaFields,
  type OwnedIdea,
} from "./ideas-api";
import styles from "./ideas.module.css";
import { DeleteIdea } from "./delete-idea";
import { IdeasSkeleton } from "./my-ideas";

const EMPTY: IdeaFields = { title: "", summary: "", details: "", stage: "concept", roles: [] };

type TextField = "title" | "summary" | "details";
type Errors = Partial<Record<TextField | "roles", string>>;

function validate(fields: IdeaFields, t: (typeof copy)[Lang]["errors"]): Errors {
  const title = fields.title.trim().length;
  const summary = fields.summary.trim().length;
  const errors: Errors = {};
  if (title < LIMITS.titleMin) errors.title = t.titleShort;
  else if (title > LIMITS.titleMax) errors.title = t.titleLong;
  if (summary < LIMITS.summaryMin) errors.summary = t.summaryShort;
  else if (summary > LIMITS.summaryMax) errors.summary = t.summaryLong;
  if (fields.details.length > LIMITS.detailsMax) errors.details = t.detailsLong;
  return errors;
}

// Closing the tab with text that was not saved asks first.
export function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

// A label, its control, the helper line and, once the text nears its limit, a count. A `note` is
// a second line of help, read with the first.
export function Field(props: {
  id: string;
  label: ReactNode;
  help: string;
  note?: string;
  error?: string;
  count?: string;
  children: ReactNode;
}) {
  const { id, label, help, note, error, count, children } = props;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      <p id={`${id}-help`} className={styles.help}>
        {help}
        {count && <span className={styles.count}>{count}</span>}
      </p>
      {note && (
        <p id={`${id}-note`} className={styles.help}>
          {note}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={onboarding.error} role="alert">
          <AlertCircle />
          {error}
        </p>
      )}
    </div>
  );
}

function Composer({ lang, id }: { lang: Lang; id: string | null }) {
  const t = copy[lang];
  const router = useRouter();
  // the first save of a new idea reopens this page on the idea's own address
  const created = useSearchParams().get("saved") === "1";
  // undefined while an existing idea loads, null for a new one or one that was not found
  const [saved, setSaved] = useState<OwnedIdea | null | undefined>(id ? undefined : null);
  const [missing, setMissing] = useState(false);
  const [fields, setFields] = useState(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // "demo" when the demo account's save was refused
  const [failed, setFailed] = useState<boolean | "demo">(false);
  // the idea was published or closed elsewhere: it is loaded again and the page says why
  const [changed, setChanged] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [asking, setAsking] = useState<"publish" | "close" | null>(null);

  useEffect(() => {
    if (!id || saved !== undefined) return;
    let live = true;
    loadMyIdea(id).then(
      (idea) => {
        if (!live) return;
        setSaved(idea);
        setFields(toFields(idea));
      },
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        if (error instanceof IdeaError && (error.status === 404 || error.status === 422)) {
          setSaved(null);
          setMissing(true);
        } else setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [id, saved]);

  const dirty = JSON.stringify(fields) !== JSON.stringify(saved ? toFields(saved) : EMPTY);
  useLeaveWarning(dirty);

  function change(patch: Partial<IdeaFields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    setJustSaved(false);
    // an error that is showing goes the moment the value is fixed; new ones wait for a save
    const found = validate(next, t.errors);
    setErrors((shown) =>
      Object.fromEntries(
        Object.keys(shown)
          .filter((key) => key !== "roles" && found[key as TextField])
          .map((key) => [key, found[key as TextField]]),
      ),
    );
  }

  // true when the form can be sent; otherwise it shows why and moves to the first problem
  function ready() {
    const found = validate(fields, t.errors);
    setErrors(found);
    const first = (["title", "summary", "details"] as const).find((key) => found[key]);
    if (first) document.getElementById(`idea-${first}`)?.focus();
    return !first;
  }

  function fail(error: unknown) {
    if (error instanceof SignedOutError) return;
    if (error instanceof IdeaError && error.code === "UNKNOWN_ROLE") setErrors({ roles: t.errors.roles });
    else if (error instanceof IdeaError && error.status === 404) setMissing(true);
    else if (id && error instanceof IdeaError && (error.code === "IDEA_NOT_DRAFT" || error.code === "IDEA_NOT_OPEN")) {
      setChanged(true);
      setSaved(undefined);
    } else setFailed(isDemoRefusal(error) ? "demo" : true);
  }

  // Runs one action at a time. A second press while it is sending does nothing.
  async function send(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setChanged(false);
    try {
      await action();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
      setAsking(null);
    }
  }

  const save = () =>
    ready() &&
    send(async () => {
      const idea = await saveIdea(fields, saved ?? null);
      setSaved(idea);
      setFields(toFields(idea));
      setJustSaved(true);
      if (!saved) router.replace(`/${lang}/ideas/compose?id=${idea.id}&saved=1`);
    });

  const publish = () =>
    send(async () => {
      const idea = await saveIdea(fields, saved ?? null);
      setSaved(idea);
      setFields(toFields(idea));
      // the page stays in memory after leaving it, so it must know the idea is now open
      setSaved(await publishIdea(idea.id));
      router.push(`/${lang}/ideas/mine?done=published`);
    });

  const close = () =>
    send(async () => {
      if (saved) setSaved(await closeIdea(saved.id));
      router.push(`/${lang}/ideas/mine?done=closed`);
    });

  if (missing) {
    return (
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{t.errors.notFoundTitle}</h1>
        <p className={onboarding.why}>{t.errors.notFoundText}</p>
        <div className={onboarding.actions}>
          <Link className={landing.btn} href={`/${lang}/ideas/mine`}>
            {t.back}
          </Link>
        </div>
      </main>
    );
  }
  if (saved === undefined && failed) throw new Error("the idea could not be loaded");
  if (saved === undefined) return <IdeasSkeleton lang={lang} />;

  const status = saved?.status ?? "draft";
  const closed = status === "closed";
  const describe = (name: TextField) =>
    `idea-${name}-help${name === "summary" ? " idea-summary-note" : ""}${errors[name] ? ` idea-${name}-error` : ""}`;
  // quiet until the text is within a tenth of its limit
  const count = (length: number, max: number) => (length > max * 0.9 ? fill(t.count, { n: length, max }) : undefined);

  return (
    <main className={`${onboarding.column} ${styles.main}`}>
      <Link className={`${onboarding.back} ${styles.backLink}`} href={`/${lang}/ideas/mine`}>
        <ArrowLeft />
        {t.back}
      </Link>
      <h1 className={styles.title}>{closed ? t.closedTitle : saved ? t.editTitle : t.newTitle}</h1>
      {closed && <p className={styles.note}>{t.closedNote}</p>}
      {changed && (
        <p className={styles.note} role="alert">
          {t.errors.changed}
        </p>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <fieldset className={styles.section} disabled={closed}>
          <legend className={styles.legend}>
            <h2 className={styles.heading}>{t.publicHeading}</h2>
          </legend>
          <p className={styles.lead}>{t.publicLead}</p>
          <Field
            id="idea-title"
            label={t.title.label}
            help={t.title.help}
            error={errors.title}
            count={count(fields.title.length, LIMITS.titleMax)}
          >
            <input
              id="idea-title"
              className={onboarding.input}
              value={fields.title}
              autoComplete="off"
              aria-invalid={!!errors.title || undefined}
              aria-describedby={describe("title")}
              onChange={(event) => change({ title: event.target.value })}
            />
          </Field>
          <Field
            id="idea-summary"
            label={t.summary.label}
            help={t.summary.help}
            note={t.summary.note}
            error={errors.summary}
            count={count(fields.summary.length, LIMITS.summaryMax)}
          >
            <textarea
              id="idea-summary"
              className={`${onboarding.input} ${styles.area}`}
              rows={5}
              value={fields.summary}
              aria-invalid={!!errors.summary || undefined}
              aria-describedby={describe("summary")}
              onChange={(event) => change({ summary: event.target.value })}
            />
          </Field>
        </fieldset>

        <fieldset className={styles.section} disabled={closed}>
          <legend className={styles.legend}>
            <h2 className={styles.heading}>
              <Lock />
              {t.privateHeading}
            </h2>
          </legend>
          <p className={styles.lead}>{t.privateLead}</p>
          <Field
            id="idea-details"
            label={t.details.label}
            help={t.details.help}
            error={errors.details}
            count={count(fields.details.length, LIMITS.detailsMax)}
          >
            <textarea
              id="idea-details"
              className={`${onboarding.input} ${styles.area}`}
              rows={8}
              value={fields.details}
              aria-invalid={!!errors.details || undefined}
              aria-describedby={describe("details")}
              onChange={(event) => change({ details: event.target.value })}
            />
          </Field>
        </fieldset>

        <fieldset className={styles.section} disabled={closed}>
          <legend className={styles.legend}>
            <h2 className={styles.heading}>{t.needsHeading}</h2>
          </legend>
          <p className={styles.lead}>{t.needsLead}</p>
          <div className={styles.field} role="radiogroup" aria-labelledby="idea-stage-label">
            <p id="idea-stage-label" className={styles.label}>
              {t.stageLabel}
            </p>
            <div className={styles.stages}>
              {STAGES.map((stage) => (
                <label key={stage} className={onboarding.choice}>
                  <input
                    type="radio"
                    name="idea-stage"
                    value={stage}
                    checked={fields.stage === stage}
                    onChange={() => change({ stage })}
                  />
                  <span className={onboarding.choiceText}>
                    <span className={onboarding.choiceName}>{t.stage[stage]}</span>
                    <span className={onboarding.choiceHint}>{t.stageHint[stage]}</span>
                  </span>
                  <Check className={onboarding.tick} />
                </label>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <p id="idea-roles-label" className={styles.label}>
              {t.roles.label}
            </p>
            <div
              role="group"
              aria-labelledby="idea-roles-label"
              aria-describedby={`idea-roles-help${errors.roles ? " idea-roles-error" : ""}`}
              className={onboarding.chips}
            >
              {ROLES.map((role) => {
                const on = fields.roles.includes(role.slug);
                return (
                  <button
                    key={role.slug}
                    type="button"
                    className={onboarding.chip}
                    aria-pressed={on}
                    onClick={() =>
                      change({ roles: on ? fields.roles.filter((slug) => slug !== role.slug) : [...fields.roles, role.slug] })
                    }
                  >
                    {role.name[lang]}
                  </button>
                );
              })}
            </div>
            <p id="idea-roles-help" className={styles.help}>
              {t.roles.help}
            </p>
            {errors.roles && (
              <p id="idea-roles-error" className={onboarding.error} role="alert">
                <AlertCircle />
                {errors.roles}
              </p>
            )}
          </div>
        </fieldset>

        {!closed && (
          <div className={`${onboarding.actions} ${onboarding.questionActions} ${styles.bar}`}>
            {failed && (
              <p className={`${onboarding.error} ${styles.failed}`} role="alert">
                <AlertCircle />
                {failed === "demo" ? notSaved(lang) : t.errors.save}
              </p>
            )}
            {status === "draft" ? (
              <>
                <button
                  type="button"
                  className={landing.btn}
                  aria-busy={(busy && asking === "publish") || undefined}
                  onClick={() => ready() && setAsking("publish")}
                >
                  {t.publish}
                </button>
                <button type="submit" className={landing.ghost} aria-busy={(busy && !asking) || undefined}>
                  {t.saveDraft}
                </button>
              </>
            ) : (
              <>
                <button type="submit" className={landing.btn} aria-busy={(busy && !asking) || undefined}>
                  {t.saveChanges}
                </button>
                <button type="button" className={landing.ghost} onClick={() => setAsking("close")}>
                  {t.close}
                </button>
              </>
            )}
            <p className={styles.saved} role="status">
              {(justSaved || created) && !dirty && (
                <>
                  <Check />
                  {t.saved}
                </>
              )}
            </p>
          </div>
        )}
      </form>
      {saved && <DeleteIdea lang={lang} id={saved.id} />}

      <ConfirmDialog
        open={asking === "publish"}
        title={t.publishConfirm.title}
        confirm={t.publishConfirm.confirm}
        cancel={t.publishConfirm.cancel}
        busy={busy}
        onConfirm={publish}
        onCancel={() => setAsking(null)}
      >
        <p>{t.publishConfirm.text}</p>
        {fields.roles.length === 0 && <p>{t.publishConfirm.noRoles}</p>}
      </ConfirmDialog>
      <ConfirmDialog
        open={asking === "close"}
        title={t.closeConfirm.title}
        confirm={t.closeConfirm.confirm}
        cancel={t.closeConfirm.cancel}
        danger
        busy={busy}
        onConfirm={close}
        onCancel={() => setAsking(null)}
      >
        <p>{t.closeConfirm.text}</p>
      </ConfirmDialog>
    </main>
  );
}

// Where a developer writes an idea: new without an id in the address, an existing one with it.
export function IdeaComposer({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  return (
    <AppFrame lang={lang} path={`ideas/compose${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<IdeasSkeleton lang={lang} />}>
        {/* another idea is another form: nothing typed for one may be saved into the next */}
        <Composer key={id ?? "new"} lang={lang} id={id} />
      </RequireSession>
    </AppFrame>
  );
}
