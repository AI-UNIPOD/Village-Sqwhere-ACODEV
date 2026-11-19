"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { Field } from "../ideas/composer";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import onboarding from "../onboarding/onboarding.module.css";
import { copy } from "./copy";
import { addLink, addPiece, editPiece, PIECE_LIMITS, type Piece, type Sketch } from "./hubs-api";
import styles from "./hubs.module.css";

// What the API counts: the characters of the trimmed text, an emoji being one.
export const size = (text: string) => [...text.trim()].length;

export const codeOf = (reason: unknown) => (reason instanceof IdeaError ? reason.code : "");

// `focus` is for a line that replaces the button that was pressed, so focus does not fall to the page.
// `demo` is the demo account's refused change: the shared line is drawn, and `text` is not read.
export type Line = { text: string; problem?: boolean; focus?: boolean; demo?: boolean };

// Runs one change under `key`, which the button that started it shows as busy. `run` answers the
// line to say, or null when it already told the person (a field error).
export type Send = (key: string, run: () => Promise<Line | null>) => Promise<void>;
export type Change = (apply: (have: Sketch) => Sketch) => void;

export type Shared = { lang: Lang; hubId: string; busy: string | null; refreshing: boolean; send: Send; change: Change };

// The describedby of a field: its help, and its error while it has one.
const describe = (id: string, error?: string) => `${id}-help${error ? ` ${id}-error` : ""}`;

// The form that adds a piece, and, with `piece`, the one that corrects it in place.
export function PieceForm(props: Shared & { piece?: Piece; onSaved?: () => void; onCancel?: () => void }) {
  const { lang, hubId, busy, refreshing, send, change, piece, onSaved, onCancel } = props;
  const d = copy[lang].designSketch;
  const key = piece?.id ?? "new";
  // only what the person typed: a field they did not touch follows the piece as it is now
  const [draft, setDraft] = useState<{ name?: string; summary?: string }>({});
  const [errors, setErrors] = useState<{ name?: string; summary?: string }>({});
  const nameField = useRef<HTMLInputElement>(null);
  const summaryField = useRef<HTMLTextAreaElement>(null);
  const name = draft.name ?? piece?.name ?? "";
  const summary = draft.summary ?? piece?.summary ?? "";
  // The Edit button that opened this form is gone with the card it replaced, so the name
  // field takes the focus. The form that adds a piece is always there and takes none.
  const editing = !!piece;
  useEffect(() => {
    if (editing) nameField.current?.focus();
  }, [editing]);

  const problem = (field: "name" | "summary", value: string) =>
    field === "name" && size(value) === 0
      ? d.errors.name
      : size(value) > PIECE_LIMITS[field]
        ? fill(d.errors.long, { max: PIECE_LIMITS[field] })
        : undefined;

  function type(field: "name" | "summary", value: string) {
    setDraft((have) => ({ ...have, [field]: value }));
    // an error that is showing goes the moment the text is fixed
    if (errors[field] && !problem(field, value)) setErrors((have) => ({ ...have, [field]: undefined }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = { name: problem("name", name), summary: problem("summary", summary) };
    setErrors(found);
    if (found.name || found.summary) {
      (found.name ? nameField : summaryField).current?.focus();
      return;
    }
    const changes = piece
      ? { ...(name.trim() !== piece.name && { name: name.trim() }), ...(summary.trim() !== piece.summary && { summary: summary.trim() }) }
      : null;
    if (changes && Object.keys(changes).length === 0) {
      onCancel?.();
      return;
    }
    void send(key, async () => {
      try {
        if (piece) {
          const saved = await editPiece(hubId, piece.id, changes!);
          change((have) => ({ ...have, pieces: have.pieces.map((one) => (one.id === saved.id ? saved : one)) }));
          onSaved?.();
          return { text: d.piece.saved, focus: true };
        }
        const made = await addPiece(hubId, { name: name.trim(), summary: summary.trim() });
        change((have) => (have.pieces.some((one) => one.id === made.id) ? have : { ...have, pieces: [...have.pieces, made] }));
        setDraft({});
        return { text: d.piece.added };
      } catch (reason) {
        if (codeOf(reason) !== "PIECE_NAME_TAKEN") throw reason;
        setErrors({ name: d.errors.taken });
        nameField.current?.focus();
        return null;
      }
    });
  }

  const nameId = `piece-name-${key}`;
  const summaryId = `piece-summary-${key}`;
  return (
    <form
      className={piece ? undefined : styles.designForm}
      noValidate
      onSubmit={submit}
      {...(piece ? { "aria-label": fill(d.piece.editLabel, { name: piece.name }) } : { "aria-labelledby": "piece-form-title" })}
    >
      {!piece && (
        <h3 id="piece-form-title" className={styles.formTitle}>
          {d.piece.title}
        </h3>
      )}
      <Field id={nameId} label={d.piece.name} help={d.piece.nameHelp} error={errors.name} count={fill(d.piece.left, { n: PIECE_LIMITS.name - size(name) })}>
        <input
          ref={nameField}
          id={nameId}
          className={onboarding.input}
          value={name}
          aria-invalid={!!errors.name || undefined}
          aria-describedby={describe(nameId, errors.name)}
          onChange={(event) => type("name", event.target.value)}
        />
      </Field>
      <Field
        id={summaryId}
        label={d.piece.summary}
        help={d.piece.summaryHelp}
        error={errors.summary}
        count={fill(d.piece.left, { n: PIECE_LIMITS.summary - size(summary) })}
      >
        <textarea
          ref={summaryField}
          id={summaryId}
          className={`${onboarding.input} ${ideas.area}`}
          rows={3}
          value={summary}
          aria-invalid={!!errors.summary || undefined}
          aria-describedby={describe(summaryId, errors.summary)}
          onChange={(event) => type("summary", event.target.value)}
        />
      </Field>
      <div className={styles.phaseActions}>
        <button type="submit" className={landing.ghost} aria-busy={busy === key || undefined} aria-disabled={refreshing || undefined}>
          {piece ? d.piece.save : d.piece.add}
        </button>
        {piece && (
          <button type="button" className={landing.ghost} onClick={onCancel}>
            {d.piece.cancel}
          </button>
        )}
      </div>
    </form>
  );
}

// The form that adds a link from one piece to another. A piece chosen in one list is not offered
// in the other, so a link never goes from a piece to itself.
export function LinkForm({ pieces, ...props }: Shared & { pieces: Piece[] }) {
  const { lang, hubId, busy, refreshing, send, change } = props;
  const d = copy[lang].designSketch;
  const [ids, setIds] = useState({ from: "", to: "" });
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<{ from?: string; to?: string; label?: string }>({});
  const fromField = useRef<HTMLSelectElement>(null);
  const toField = useRef<HTMLSelectElement>(null);
  const labelField = useRef<HTMLInputElement>(null);
  // a piece that was deleted since it was chosen is no longer chosen
  const chosen = (id: string) => (pieces.some((one) => one.id === id) ? id : "");
  const from = chosen(ids.from);
  const to = chosen(ids.to);
  const named = (id: string) => pieces.find((one) => one.id === id)?.name ?? "";

  const labelProblem = (value: string) =>
    size(value) === 0 ? d.errors.label : size(value) > PIECE_LIMITS.label ? fill(d.errors.long, { max: PIECE_LIMITS.label }) : undefined;

  function choose(side: "from" | "to", id: string) {
    setIds((have) => ({ ...have, [side]: id }));
    if (id) setErrors((have) => ({ ...have, [side]: undefined }));
  }

  function type(value: string) {
    setLabel(value);
    if (errors.label && !labelProblem(value)) setErrors((have) => ({ ...have, label: undefined }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const found = { from: from ? undefined : d.errors.from, to: to ? undefined : d.errors.to, label: labelProblem(label) };
    setErrors(found);
    const bad = found.from ? fromField : found.to ? toField : found.label ? labelField : null;
    if (bad) {
      bad.current?.focus();
      return;
    }
    void send("link", async () => {
      try {
        const made = await addLink(hubId, { from_piece_id: from, to_piece_id: to, label: label.trim() });
        change((have) => (have.links.some((one) => one.id === made.id) ? have : { ...have, links: [...have.links, made] }));
        setIds({ from: "", to: "" });
        setLabel("");
        return { text: d.link.added };
      } catch (reason) {
        if (codeOf(reason) !== "LINK_EXISTS") throw reason;
        return { text: fill(d.errors.linkExists, { from: named(from), to: named(to) }), problem: true };
      }
    });
  }

  return (
    <form className={styles.designForm} noValidate aria-labelledby="link-form-title" onSubmit={submit}>
      <h3 id="link-form-title" className={styles.formTitle}>
        {d.link.title}
      </h3>
      <Field id="link-from" label={d.link.from} help={d.link.fromHelp} error={errors.from}>
        <select
          ref={fromField}
          id="link-from"
          className={`${onboarding.input} ${styles.pick}`}
          value={from}
          aria-invalid={!!errors.from || undefined}
          aria-describedby={describe("link-from", errors.from)}
          onChange={(event) => choose("from", event.target.value)}
        >
          <option value="">{d.link.choose}</option>
          {pieces
            .filter((one) => one.id !== to)
            .map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
        </select>
      </Field>
      <Field id="link-to" label={d.link.to} help={d.link.toHelp} error={errors.to}>
        <select
          ref={toField}
          id="link-to"
          className={`${onboarding.input} ${styles.pick}`}
          value={to}
          aria-invalid={!!errors.to || undefined}
          aria-describedby={describe("link-to", errors.to)}
          onChange={(event) => choose("to", event.target.value)}
        >
          <option value="">{d.link.choose}</option>
          {pieces
            .filter((one) => one.id !== from)
            .map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
        </select>
      </Field>
      <Field
        id="link-label"
        label={d.link.label}
        help={d.link.labelHelp}
        error={errors.label}
        count={fill(d.piece.left, { n: PIECE_LIMITS.label - size(label) })}
      >
        <input
          ref={labelField}
          id="link-label"
          className={onboarding.input}
          value={label}
          aria-invalid={!!errors.label || undefined}
          aria-describedby={describe("link-label", errors.label)}
          onChange={(event) => type(event.target.value)}
        />
      </Field>
      <div className={styles.phaseActions}>
        <button type="submit" className={landing.ghost} aria-busy={busy === "link" || undefined} aria-disabled={refreshing || undefined}>
          {d.link.add}
        </button>
      </div>
    </form>
  );
}
