"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { Field } from "../ideas/composer";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import onboarding from "../onboarding/onboarding.module.css";
import { GithubLink, type Shared } from "./build-parts";
import { copy } from "./copy";
import { isRepository, setRepository, tidyRepository, type Build } from "./hubs-api";
import styles from "./hubs.module.css";

const FIELD = "build-repository-address";

// The team's repository: its address as a link and, for the hub's owner while the hub is in build,
// the form that sets it and the button that removes it. `said` is the status line, shown under them.
export function Repository({ shared, build, linkable, said }: { shared: Shared; build: Build; linkable: boolean; said: ReactNode }) {
  const { lang, hubId, busy, send, apply } = shared;
  const t = copy[lang].buildTab;
  const r = t.repository;
  // only what the person typed: until then the field follows the address the tab holds now
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [asking, setAsking] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const value = draft ?? build.repository_url ?? "";

  function type(text: string) {
    setDraft(text);
    // an error that is showing goes the moment the address is fixed
    if (error && isRepository(tidyRepository(text))) setError(undefined);
  }

  function reject() {
    setError(t.errors.address);
    field.current?.focus();
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const tidy = tidyRepository(value);
    if (!isRepository(tidy)) return reject();
    void send("save", async () => {
      try {
        apply(await setRepository(hubId, tidy));
        setDraft(null);
        return { text: r.saved };
      } catch (reason) {
        // the API's own check said no: the same field error, whatever rule it was
        if (!(reason instanceof IdeaError && reason.status === 422)) throw reason;
        reject();
        return null;
      }
    });
  }

  // The dialog closes first: the Remove button is gone once the repository is, and the line that
  // says so takes the focus, which a modal dialog would not let it.
  function remove() {
    setAsking(false);
    void send("remove", async () => {
      apply(await setRepository(hubId, null));
      setDraft(null);
      setError(undefined);
      return { text: r.removed, focus: true };
    });
  }

  return (
    <section aria-labelledby="build-repository" className={styles.buildPart}>
      <h3 id="build-repository" className={styles.formTitle}>
        {r.heading}
      </h3>
      {build.repository_url ? (
        <p className={styles.address}>
          <GithubLink lang={lang} href={build.repository_url} linkable={linkable}>
            {build.repository_url}
          </GithubLink>
        </p>
      ) : (
        !build.can_set_repository && <p className={`${ideas.meta} ${styles.line}`}>{r.none}</p>
      )}
      {build.can_set_repository && (
        <form className={styles.designForm} noValidate onSubmit={save}>
          <Field id={FIELD} label={r.label} help={r.help} error={error}>
            <input
              ref={field}
              id={FIELD}
              className={onboarding.input}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={value}
              aria-invalid={!!error || undefined}
              aria-describedby={`${FIELD}-help${error ? ` ${FIELD}-error` : ""}`}
              onChange={(event) => type(event.target.value)}
            />
          </Field>
          <div className={styles.phaseActions}>
            <button type="submit" className={landing.ghost} aria-busy={busy === "save" || undefined} aria-disabled={(!!busy && busy !== "save") || undefined}>
              {r.save}
            </button>
            {build.repository_url && (
              <button
                type="button"
                className={landing.ghost}
                aria-busy={busy === "remove" || undefined}
                aria-disabled={(!!busy && busy !== "remove") || undefined}
                onClick={() => !busy && setAsking(true)}
              >
                {r.remove}
              </button>
            )}
          </div>
        </form>
      )}
      {said}
      <ConfirmDialog open={asking} title={r.removeTitle} confirm={r.removeConfirm} cancel={r.cancel} danger onConfirm={remove} onCancel={() => setAsking(false)}>
        <p>{r.removeText}</p>
      </ConfirmDialog>
    </section>
  );
}
