"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import { ConfirmDialog } from "../confirm-dialog";
import { isDemoRefusal, notSaved } from "../demo-refusal";
import { IdeaError, loadMyIdea, type OwnedIdea } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { AgreementBlock, signatureErrors } from "./agreement-block";
import { copy } from "./copy";
import { FieldError, Warning } from "./form-parts";
import { LIMITS, OWNERSHIP, createHub, loadAgreement, type Agreement, type Ownership } from "./hubs-api";
import styles from "./hubs.module.css";
import { HubsSkeleton } from "./my-hubs";

// Other screens import the warning from here.
export { Warning };

type Blocked = keyof (typeof copy)["en"]["blocked"];
type FieldName = "name" | "description" | "notes" | "read" | "legalName";
type Errors = Partial<Record<FieldName, string>>;
type Fields = { name: string; description: string; ownership: Ownership; notes: string; read: boolean; legalName: string };

const ORDER: FieldName[] = ["name", "description", "notes", "read", "legalName"];

function validate(fields: Fields, t: (typeof copy)[Lang]["errors"]): Errors {
  const errors: Errors = {};
  const name = fields.name.trim().length;
  const notes = fields.notes.trim().length;
  if (name === 0) errors.name = t.nameRequired;
  else if (name > LIMITS.nameMax) errors.name = t.nameLong;
  if (fields.description.length > LIMITS.descriptionMax) errors.description = t.descriptionLong;
  if (notes === 0 && fields.ownership !== "equal_split") errors.notes = t.notesRequired;
  else if (notes > LIMITS.notesMax) errors.notes = t.notesLong;
  return { ...errors, ...signatureErrors(fields.read, fields.legalName, t) };
}

// What an API refusal means for this page, or null when it is a failure to report. A bad idea
// id can only be "missing" before the idea has loaded.
function blockedBy(error: unknown, ideaLoaded: boolean): Blocked | null {
  if (!(error instanceof IdeaError)) return null;
  if (error.code === "AGREEMENT_NOT_PUBLISHED") return "noAgreement";
  if (error.code === "HUB_ALREADY_EXISTS") return "exists";
  if (error.code === "IDEA_NOT_OPEN") return "notOpen";
  return error.status === 404 || (error.status === 422 && !ideaLoaded) ? "missing" : null;
}

function BlockedScreen({ lang, why, ideaId }: { lang: Lang; why: Blocked; ideaId: string | null }) {
  const t = copy[lang];
  const link =
    why === "notOpen" && ideaId
      ? { href: `/${lang}/ideas/compose?id=${ideaId}`, label: t.openComposer }
      : why === "exists"
        ? { href: `/${lang}/hubs`, label: t.yourHubs }
        : { href: `/${lang}/ideas/mine`, label: t.yourIdeas };
  return (
    <main className={`${onboarding.column} ${onboarding.step}`}>
      <h1 className={onboarding.title}>{t.blocked[why].title}</h1>
      <p className={onboarding.why}>{t.blocked[why].text}</p>
      <div className={onboarding.actions}>
        <Link className={landing.btn} href={link.href}>
          {link.label}
        </Link>
      </div>
    </main>
  );
}

function NewHubForm({ lang, ideaId }: { lang: Lang; ideaId: string | null }) {
  const t = copy[lang];
  const router = useRouter();
  const [idea, setIdea] = useState<OwnedIdea | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(ideaId ? null : "missing");
  const [failure, setFailure] = useState<Error | null>(null);
  const [fields, setFields] = useState<Fields>({
    name: "",
    description: "",
    ownership: "equal_split",
    notes: "",
    read: false,
    legalName: "",
  });
  const [typed, setTyped] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"changed" | "send" | "demo" | null>(null);

  useEffect(() => {
    if (!ideaId) return;
    let live = true;
    Promise.all([loadMyIdea(ideaId), loadAgreement()]).then(
      ([foundIdea, foundAgreement]) => {
        if (!live) return;
        setIdea(foundIdea);
        setAgreement(foundAgreement);
        setFields((before) => ({ ...before, name: foundIdea.title.slice(0, LIMITS.nameMax) }));
        if (foundIdea.status !== "open") setBlocked("notOpen");
      },
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        const why = blockedBy(error, false);
        if (why) setBlocked(why);
        else setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [ideaId]);

  useEffect(() => {
    if (!typed) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [typed]);

  function change(patch: Partial<Fields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    setTyped(true);
    // an error that is showing goes the moment its field is right; new ones wait for the button
    const found = validate(next, t.errors);
    setErrors((shown) => Object.fromEntries(ORDER.filter((key) => shown[key] && found[key]).map((key) => [key, found[key]])));
  }

  function ask() {
    const found = validate(fields, t.errors);
    setErrors(found);
    const first = ORDER.find((key) => found[key]);
    if (first) document.getElementById(`hub-${first}`)?.focus();
    else setAsking(true);
  }

  async function sign() {
    if (busy || !idea || !agreement) return;
    setBusy(true);
    setProblem(null);
    try {
      const notes = fields.notes.trim();
      const hub = await createHub({
        idea_id: idea.id,
        name: fields.name.trim(),
        description: fields.description.trim() || null,
        terms: { ownership_model: fields.ownership, ...(notes ? { notes } : {}) },
        agreement: {
          template_id: agreement.template_id,
          template_sha256: agreement.body_sha256,
          signed_legal_name: fields.legalName.trim(),
        },
      });
      setTyped(false);
      router.push(`/${lang}/hubs/view?id=${hub.id}&created=1`);
    } catch (error) {
      if (error instanceof SignedOutError) return;
      if (error instanceof IdeaError && error.code === "AGREEMENT_MISMATCH") {
        // never sign a text the person did not see: show the new one and ask again
        setFields((before) => ({ ...before, read: false }));
        setProblem("changed");
        loadAgreement().then(setAgreement, () => setProblem("send"));
      } else {
        const why = blockedBy(error, true);
        if (why) setBlocked(why);
        else setProblem(isDemoRefusal(error) ? "demo" : "send");
      }
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  if (failure) throw failure;
  if (blocked) return <BlockedScreen lang={lang} why={blocked} ideaId={ideaId} />;
  if (!idea || !agreement) return <HubsSkeleton lang={lang} />;

  const describe = (name: FieldName) => `hub-${name}-help${errors[name] ? ` hub-${name}-error` : ""}`;
  const needsNotes = fields.ownership !== "equal_split";

  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <h1 className={ideas.title}>{t.newTitle}</h1>
      <p className={ideas.lead}>{fill(t.newLead, { idea: idea.title })}</p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <fieldset className={ideas.section}>
          <legend className={ideas.legend}>
            <h2 className={ideas.heading}>{t.hubHeading}</h2>
          </legend>
          <div className={ideas.field}>
            <label htmlFor="hub-name" className={ideas.label}>
              {t.name.label}
            </label>
            <input
              id="hub-name"
              className={onboarding.input}
              value={fields.name}
              autoComplete="off"
              aria-invalid={!!errors.name || undefined}
              aria-describedby={describe("name")}
              onChange={(event) => change({ name: event.target.value })}
            />
            <p id="hub-name-help" className={ideas.help}>
              {t.name.help}
            </p>
            <FieldError id="hub-name">{errors.name}</FieldError>
          </div>
          <div className={ideas.field}>
            <label htmlFor="hub-description" className={ideas.label}>
              {t.description.label}
            </label>
            <textarea
              id="hub-description"
              className={`${onboarding.input} ${ideas.area}`}
              rows={4}
              value={fields.description}
              aria-invalid={!!errors.description || undefined}
              aria-describedby={describe("description")}
              onChange={(event) => change({ description: event.target.value })}
            />
            <p id="hub-description-help" className={ideas.help}>
              {t.description.help}
            </p>
            <FieldError id="hub-description">{errors.description}</FieldError>
          </div>
        </fieldset>

        <fieldset className={ideas.section}>
          <legend className={ideas.legend}>
            <h2 className={ideas.heading}>{t.termsHeading}</h2>
          </legend>
          <Warning title={t.termsWarning.title}>{t.termsWarning.text}</Warning>
          <div className={ideas.field} role="radiogroup" aria-labelledby="hub-ownership-label">
            <p id="hub-ownership-label" className={ideas.label}>
              {t.ownershipLabel}
            </p>
            <div className={ideas.stages}>
              {OWNERSHIP.map((model) => (
                <label key={model} className={onboarding.choice}>
                  <input
                    type="radio"
                    name="hub-ownership"
                    value={model}
                    checked={fields.ownership === model}
                    onChange={() => change({ ownership: model })}
                  />
                  <span className={onboarding.choiceText}>
                    <span className={onboarding.choiceName}>{t.ownership[model].title}</span>
                    <span className={onboarding.choiceHint}>{t.ownership[model].text}</span>
                  </span>
                  <Check className={onboarding.tick} />
                </label>
              ))}
            </div>
          </div>
          <div className={ideas.field}>
            <label htmlFor="hub-notes" className={ideas.label}>
              {t.notes.label}
            </label>
            <textarea
              id="hub-notes"
              className={`${onboarding.input} ${ideas.area}`}
              rows={3}
              value={fields.notes}
              aria-required={needsNotes}
              aria-invalid={!!errors.notes || undefined}
              aria-describedby={describe("notes")}
              onChange={(event) => change({ notes: event.target.value })}
            />
            <p id="hub-notes-help" className={ideas.help}>
              {t.notes.help}
            </p>
            <FieldError id="hub-notes">{errors.notes}</FieldError>
          </div>
        </fieldset>

        <AgreementBlock
          lang={lang}
          agreement={agreement}
          changed={problem === "changed"}
          read={fields.read}
          legalName={fields.legalName}
          errors={errors}
          onRead={(read) => change({ read })}
          onLegalName={(legalName) => change({ legalName })}
        />

        <div className={`${onboarding.actions} ${ideas.bar}`}>
          {(problem === "send" || problem === "demo") && (
            <p className={`${onboarding.error} ${ideas.failed}`} role="alert">
              <AlertCircle />
              {problem === "demo" ? notSaved(lang) : t.errors.send}
            </p>
          )}
          <button type="submit" className={landing.btn}>
            {t.sign}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={asking}
        title={t.confirm.title}
        confirm={t.confirm.confirm}
        cancel={t.confirm.cancel}
        busy={busy}
        onConfirm={sign}
        onCancel={() => setAsking(false)}
      >
        <p className={styles.said}>{fields.name.trim()}</p>
        <p>{t.ownership[fields.ownership].title}</p>
        <p>{fill(t.confirm.signedAs, { name: fields.legalName.trim() })}</p>
        <p>{t.confirm.frozen}</p>
      </ConfirmDialog>
    </main>
  );
}

// The idea's owner names the hub, sets its terms and signs the agreement, in one page.
export function NewHub({ lang }: { lang: Lang }) {
  const ideaId = useSearchParams().get("idea");
  return (
    <AppFrame lang={lang} path={`hubs/new${ideaId ? `?idea=${encodeURIComponent(ideaId)}` : ""}`}>
      <RequireSession lang={lang} fallback={<HubsSkeleton lang={lang} />}>
        {/* another idea is another form: a signature typed for one must not reach the next */}
        <NewHubForm key={ideaId ?? "none"} lang={lang} ideaId={ideaId} />
      </RequireSession>
    </AppFrame>
  );
}
