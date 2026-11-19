"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import { ConfirmDialog } from "../confirm-dialog";
import { DEMO_READ_ONLY, notSaved } from "../demo-refusal";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, ArrowLeft } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import { AgreementBlock, signatureErrors } from "./agreement-block";
import { copy } from "./copy";
import { acceptInvitation, loadHub, loadHubAgreement, type Agreement, type Hub } from "./hubs-api";
import { forgetInvitation } from "./invitations";
import styles from "./hubs.module.css";
import { HubsSkeleton, MissingHub } from "./my-hubs";

type Blocked = "missing" | "noInvitation" | "archived" | "full";
type Errors = Partial<Record<"read" | "legalName", string>>;

const ORDER = ["read", "legalName"] as const;

// A refusal that has a screen of its own, with one link on.
function BlockedScreen({ lang, why, id }: { lang: Lang; why: Exclude<Blocked, "missing">; id: string }) {
  const t = copy[lang];
  return (
    <main className={`${onboarding.column} ${onboarding.step}`}>
      <h1 className={onboarding.title}>{t.join[why].title}</h1>
      <p className={onboarding.why}>{t.join[why].text}</p>
      <div className={onboarding.actions}>
        <Link className={landing.btn} href={`/${lang}/hubs/view?id=${encodeURIComponent(id)}`}>
          {t.openHub}
        </Link>
      </div>
    </main>
  );
}

function JoinForm({ lang, id }: { lang: Lang; id: string | null }) {
  const t = copy[lang];
  const router = useRouter();
  const [hub, setHub] = useState<Hub | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [blocked, setBlocked] = useState<Blocked | null>(id ? null : "missing");
  const [failure, setFailure] = useState<Error | null>(null);
  const [fields, setFields] = useState({ read: false, legalName: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"changed" | "send" | "demo" | null>(null);
  const hubAddress = `/${lang}/hubs/view?id=${encodeURIComponent(id ?? "")}`;

  useEffect(() => {
    if (!id) return;
    let live = true;
    Promise.all([loadHub(id), loadHubAgreement(id)]).then(
      ([foundHub, foundAgreement]) => {
        if (!live) return;
        const status = foundHub.viewer.membership_status;
        if (status === "active") router.replace(`/${lang}/hubs/view?id=${encodeURIComponent(id)}`);
        else if (status !== "invited") setBlocked("noInvitation");
        else if (foundHub.status === "archived") setBlocked("archived");
        else {
          setHub(foundHub);
          setAgreement(foundAgreement);
        }
      },
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        if (error instanceof IdeaError && (error.status === 404 || error.status === 422)) setBlocked("missing");
        else setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [id, lang, router]);

  function change(patch: Partial<typeof fields>) {
    const next = { ...fields, ...patch };
    setFields(next);
    // an error that is showing goes the moment its field is right; new ones wait for the button
    const found = signatureErrors(next.read, next.legalName, t.errors);
    setErrors((shown) => Object.fromEntries(ORDER.filter((key) => shown[key] && found[key]).map((key) => [key, found[key]])));
  }

  function ask() {
    const found = signatureErrors(fields.read, fields.legalName, t.errors);
    setErrors(found);
    const first = ORDER.find((key) => found[key]);
    if (first) document.getElementById(`hub-${first}`)?.focus();
    else setAsking(true);
  }

  async function sign() {
    if (busy || !id || !agreement) return;
    setBusy(true);
    setProblem(null);
    try {
      await acceptInvitation(id, {
        template_id: agreement.template_id,
        template_sha256: agreement.body_sha256,
        signed_legal_name: fields.legalName.trim(),
      });
      forgetInvitation(id);
      // this page stays in memory after the move: leave nothing here that could be signed again
      setHub(null);
      setAgreement(null);
      setFields({ read: false, legalName: "" });
      router.push(`/${lang}/hubs/view?id=${encodeURIComponent(id)}&joined=1`);
    } catch (error) {
      if (error instanceof SignedOutError) return;
      const code = error instanceof IdeaError ? error.code : null;
      if (code === "AGREEMENT_MISMATCH") {
        // never sign a text the person did not see: show the new one and ask again
        setFields((before) => ({ ...before, read: false }));
        setProblem("changed");
        loadHubAgreement(id).then(setAgreement, () => setProblem("send"));
      } else if (code === "INVITATION_NOT_FOUND") setBlocked("noInvitation");
      else if (code === "ALREADY_MEMBER") router.replace(hubAddress);
      else if (code === "HUB_ARCHIVED") setBlocked("archived");
      // the last place went to someone else while this person was reading
      else if (code === "TEAM_FULL") setBlocked("full");
      else setProblem(code === DEMO_READ_ONLY ? "demo" : "send");
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  if (failure) throw failure;
  if (blocked === "missing") return <MissingHub lang={lang} />;
  if (blocked && id) return <BlockedScreen lang={lang} why={blocked} id={id} />;
  if (!hub || !agreement) return <HubsSkeleton lang={lang} />;

  // the terms signed with this text, as the server sends them with it
  const terms = agreement.hub_terms;
  const ownership = terms.ownership_model && t.ownership[terms.ownership_model];

  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <Link className={`${onboarding.back} ${ideas.backLink}`} href={hubAddress}>
        <ArrowLeft />
        {hub.name}
      </Link>
      <h1 className={ideas.title}>{fill(t.join.title, { name: hub.name })}</h1>
      <p className={ideas.lead}>{fill(t.join.lead, { owner: hub.owner.display_name, idea: hub.idea.title })}</p>

      <section className={ideas.section}>
        <h2 className={ideas.heading}>{t.termsHeading}</h2>
        {ownership && (
          <>
            <p className={`${styles.strong} ${styles.line}`}>{ownership.title}</p>
            <p className={styles.text}>{ownership.text}</p>
          </>
        )}
        {terms.notes && <p className={styles.text}>{terms.notes}</p>}
        <p className={`${ideas.meta} ${styles.line}`}>{t.join.frozen}</p>
      </section>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
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
              {problem === "demo" ? notSaved(lang) : t.join.send}
            </p>
          )}
          <button type="submit" className={landing.btn}>
            {t.join.sign}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={asking}
        title={t.join.confirm.title}
        confirm={t.join.confirm.confirm}
        cancel={t.join.confirm.cancel}
        busy={busy}
        onConfirm={sign}
        onCancel={() => setAsking(false)}
      >
        <p className={styles.said}>{hub.name}</p>
        {ownership && <p>{ownership.title}</p>}
        <p>{fill(t.confirm.signedAs, { name: fields.legalName.trim() })}</p>
      </ConfirmDialog>
    </main>
  );
}

// An invited developer reads the hub's terms and its own agreement, then signs to join.
export function JoinHub({ lang }: { lang: Lang }) {
  const id = useSearchParams().get("id");
  return (
    <AppFrame lang={lang} path={`hubs/join${id ? `?id=${encodeURIComponent(id)}` : ""}`}>
      <RequireSession lang={lang} fallback={<HubsSkeleton lang={lang} />}>
        {/* another hub is another form: a signature typed for one must not reach the next */}
        <JoinForm key={id ?? "none"} lang={lang} id={id} />
      </RequireSession>
    </AppFrame>
  );
}
