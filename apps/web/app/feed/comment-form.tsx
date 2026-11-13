"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Field } from "../ideas/composer";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import styles from "./comments.module.css";
import { copy } from "./copy";
import { COMMENT_MAX } from "./feed-api";

// What to say when a comment was not sent: `field` is about the text itself, `failed` about the
// sending. Both empty means there is nothing to say (the session ended and the page moves on).
export type Problem = { field?: string; failed?: string };

// One box for a new comment, a reply and an edit. `onSend` answers null once it is sent.
export function CommentForm(props: {
  lang: Lang;
  id: string;
  label: string;
  action: string;
  /** The page's one main button: only the box for a new comment has it. */
  main?: boolean;
  initial?: string;
  /** A box that opens in place takes focus, and offers to close. */
  onCancel?: () => void;
  onSend: (text: string) => Promise<Problem | null>;
}) {
  const { lang, id, label, action, main, initial = "", onCancel, onSend } = props;
  const c = copy[lang].comments;
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const nested = !!onCancel;

  // A box that opens in place takes focus, with the cursor after the text so an edit continues where it
  // ended. The whole box is brought clear of the bar of places, buttons included: focus alone would
  // leave them under it, because it moves nothing while the field itself is on screen.
  useEffect(() => {
    if (!nested) return;
    area.current?.focus({ preventScroll: true });
    area.current?.setSelectionRange(initial.length, initial.length);
    form.current?.scrollIntoView?.({ block: "nearest" });
  }, [nested, initial]);

  const problem = (value: string) =>
    value.trim() === "" ? c.errors.empty : value.length > COMMENT_MAX ? fill(c.errors.long, { max: COMMENT_MAX.toLocaleString(lang) }) : null;

  function change(value: string) {
    setText(value);
    setFailed(null);
    // an error that is showing goes the moment the text is fixed
    if (error && !problem(value)) setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const found = problem(text);
    setError(found);
    if (found) {
      area.current?.focus();
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      const outcome = await onSend(text);
      if (!outcome) setText("");
      else {
        setError(outcome.field ?? null);
        setFailed(outcome.failed ?? null);
        if (outcome.field) area.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  const describe = `${id}-help${error ? ` ${id}-error` : ""}`;
  return (
    <form
      ref={form}
      id={`${id}-form`}
      className={styles.form}
      data-opens={nested || undefined}
      noValidate
      onSubmit={submit}
      onKeyDown={(event) => event.key === "Escape" && onCancel?.()}
    >
      <Field
        id={id}
        label={label}
        help={c.help}
        error={error ?? undefined}
        // quiet until the text is within a tenth of its limit
        count={text.length > COMMENT_MAX * 0.9 ? fill(c.count, { n: text.length, max: COMMENT_MAX }) : undefined}
      >
        <textarea
          ref={area}
          id={id}
          className={`${onboarding.input} ${ideas.area}`}
          rows={3}
          value={text}
          aria-invalid={!!error || undefined}
          aria-describedby={describe}
          onChange={(event) => change(event.target.value)}
        />
      </Field>
      {failed && (
        <p className={onboarding.error} role="alert">
          <AlertCircle />
          {failed}
        </p>
      )}
      <div className={styles.formActions}>
        <button type="submit" className={main ? landing.btn : landing.ghost} aria-busy={busy || undefined}>
          {action}
        </button>
        {onCancel && (
          <button type="button" className={landing.ghost} onClick={onCancel}>
            {c.cancel}
          </button>
        )}
      </div>
    </form>
  );
}
