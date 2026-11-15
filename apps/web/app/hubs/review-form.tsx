"use client";

import { useRef, useState, type FormEvent } from "react";

import { Field } from "../ideas/composer";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import onboarding from "../onboarding/onboarding.module.css";
import { copy } from "./copy";
import { size, type Line } from "./design-forms";
import { addCheck, CHECK_MAX, type Review, type ReviewPiece } from "./hubs-api";
import styles from "./hubs.module.css";

// Runs one change under `key`, which the button that started it shows as busy, and says its line
// in `area`: a piece's id, or "hub" for the checklist as a whole. `run` answers the line to say, or
// null when it already told the person (a field error).
export type Send = (area: string, key: string, run: () => Promise<Line | null>) => Promise<void>;

// What the parts of the review tab share: the change on its way, the way to send one, the way to
// change the checklist from an answer, and the way to read it again.
export type Shared = {
  lang: Lang;
  hubId: string;
  busy: string | null;
  send: Send;
  change: (apply: (have: Review) => Review) => void;
  refresh: () => Promise<void>;
};

// One change at a time: the button that started it is busy and the others do nothing.
export const buttonState = (busy: string | null, key: string) => ({
  "aria-busy": busy === key || undefined,
  "aria-disabled": (!!busy && busy !== key) || undefined,
});

// The field under a piece that adds a check to it.
export function CheckForm({ shared, piece }: { shared: Shared; piece: ReviewPiece }) {
  const { lang, hubId, busy, send, change, refresh } = shared;
  const r = copy[lang].reviewTab;
  const key = `add-${piece.id}`;
  const id = `review-check-${piece.id}`;
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const field = useRef<HTMLTextAreaElement>(null);
  const fits = (value: string) => size(value) > 0 && size(value) <= CHECK_MAX;

  function type(value: string) {
    setText(value);
    // an error that is showing goes the moment the text is fixed
    if (error && fits(value)) setError(undefined);
  }

  function reject() {
    setError(r.errors.length);
    field.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!fits(text)) return reject();
    void send(piece.id, key, async () => {
      try {
        const made = await addCheck(hubId, piece.id, text.trim());
        change((have) => ({ ...have, pieces: have.pieces.map((one) => (one.id === piece.id ? { ...one, checks: [...one.checks, made] } : one)) }));
        setText("");
        await refresh();
        return { text: r.said.added };
      } catch (reason) {
        // the API's own check said no: the same field error, and what was typed stays
        if (!(reason instanceof IdeaError && reason.status === 422)) throw reason;
        reject();
        return null;
      }
    });
  }

  return (
    <form className={styles.designForm} noValidate onSubmit={submit}>
      <Field
        id={id}
        label={
          <>
            {r.add.label}
            <span className={landing.srOnly}> {fill(r.add.labelFor, { name: piece.name })}</span>
          </>
        }
        help={r.add.help}
        error={error}
      >
        <textarea
          ref={field}
          id={id}
          className={`${onboarding.input} ${ideas.area}`}
          rows={2}
          value={text}
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={(event) => type(event.target.value)}
        />
      </Field>
      <div className={styles.phaseActions}>
        <button type="submit" className={landing.ghost} aria-label={fill(r.add.addLabel, { name: piece.name })} {...buttonState(busy, key)}>
          {r.add.add}
        </button>
      </div>
    </form>
  );
}
