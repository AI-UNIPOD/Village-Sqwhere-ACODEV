"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { isDemoRefusal, notSaved } from "../demo-refusal";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { deleteIdea, IdeaError } from "./ideas-api";
import styles from "./ideas.module.css";

// The author deletes an idea for good, behind a confirmation. An idea with a hub is refused:
// its members signed an agreement about it, so it can only be closed.
export function DeleteIdea({ lang, id }: { lang: Lang; id: string }) {
  const t = copy[lang].remove;
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"hub" | "failed" | "demo" | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await deleteIdea(id);
      router.push(`/${lang}/ideas/mine?done=deleted`);
    } catch (error) {
      if (error instanceof SignedOutError) return;
      if (isDemoRefusal(error)) return setProblem("demo");
      // already deleted in another tab: the list says it is gone
      if (error instanceof IdeaError && error.status === 404) router.push(`/${lang}/ideas/mine?done=deleted`);
      else setProblem(error instanceof IdeaError && error.code === "IDEA_HAS_HUB" ? "hub" : "failed");
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="delete-idea">
      <h2 id="delete-idea" className={styles.heading}>
        {t.heading}
      </h2>
      <p className={styles.note}>{t.text}</p>
      {problem && (
        <p className={onboarding.error} role="alert">
          <AlertCircle />
          {problem === "hub" ? t.hasHub : problem === "demo" ? notSaved(lang) : t.failed}
        </p>
      )}
      {problem !== "hub" && (
        <button type="button" className={`${landing.ghost} ${styles.act}`} onClick={() => setAsking(true)}>
          {t.button}
        </button>
      )}
      <ConfirmDialog open={asking} title={t.title} confirm={t.confirm} cancel={t.cancel} danger busy={busy} onConfirm={remove} onCancel={() => setAsking(false)}>
        <p>{t.dialog}</p>
      </ConfirmDialog>
    </section>
  );
}
