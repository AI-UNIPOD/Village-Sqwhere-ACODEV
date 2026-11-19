"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { when } from "../feed/post-parts";
import { Field } from "../ideas/composer";
import { DEMO_READ_ONLY, NotSaved } from "../demo-refusal";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import { ConfirmDialog } from "../confirm-dialog";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, X } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { Tooltip } from "../tooltip";
import { copy } from "./copy";
import { LoadFailed } from "./form-parts";
import { addNote, deleteNote, loadHub, loadNotes, NOTE_MAX, type Hub, type Note } from "./hubs-api";
import styles from "./hubs.module.css";

// The hub changed in another tab or window, or the person is no longer in it: notes cannot be changed.
const CHANGED = ["PHASE_CLOSED", "TEAM_NOT_CONFIRMED", "HUB_ARCHIVED", "NOT_HUB_MEMBER"];

// What the API counts: the characters of the trimmed text, an emoji being one.
const size = (text: string) => [...text.trim()].length;

// `focus` is for a line that replaces the button that was pressed, so focus does not fall to the page.
// `demo` is the demo account's refused change: the shared line is drawn, and `text` is not read.
type Line = { text: string; problem?: boolean; focus?: boolean; demo?: boolean };

// The hub's brainstorm notes, for its active members once the team is confirmed. Everyone can
// add and delete their own while the hub is in brainstorm; after that the notes are for reading.
// There are no live updates: the list is read when the section shows and on Refresh.
export function Notes({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang];
  const n = t.brainstormNotes;
  const [notes, setNotes] = useState<Note[] | null>(null);
  // read again with each load, so every date counts from the same moment
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [line, setLine] = useState<(Line & { n: number }) | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  // the note the person is being asked about deleting
  const [target, setTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  // the Try again button goes away once the list loads, so the line that says so takes the focus
  const moveFocus = useRef(false);

  // a new object each time, so the same sentence twice is still announced
  const say = useCallback((found: Line) => setLine((have) => ({ ...found, n: (have?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (line?.focus) said.current?.focus();
  }, [line]);

  useEffect(() => {
    let live = true;
    loadNotes(hub.id).then(
      (found) => {
        if (!live) return;
        setNotes(found);
        setNow(Date.now());
        setFailed(false);
        setRefreshing(false);
        if (attempt > 0) say({ text: n.refreshed, focus: moveFocus.current });
      },
      (reason: unknown) => {
        if (!live || reason instanceof SignedOutError) return;
        setFailed(true);
        setRefreshing(false);
      },
    );
    return () => {
      live = false;
    };
  }, [hub.id, attempt, n, say]);

  function reload(focus: boolean) {
    // a list read while a note is on its way could miss the note or hold it twice
    if (refreshing || sending) return;
    moveFocus.current = focus;
    setRefreshing(true);
    setLine(null);
    setAttempt((count) => count + 1);
  }

  // The sentence for a refused or failed write, or null for a signed-out person, who is being sent to sign-in.
  function refused(reason: unknown): Line | null {
    if (reason instanceof SignedOutError) return null;
    const code = reason instanceof IdeaError ? reason.code : "";
    // the demo can never save it, so "try again" would be wrong
    if (code === DEMO_READ_ONLY) return { text: "", demo: true };
    if (CHANGED.includes(code)) {
      // show the hub as it is now, so the section fits it; the line already says what happened
      loadHub(hub.id).then(onChange, () => {});
      return { text: n.errors.changed, problem: true, focus: true };
    }
    if (code === "NOTES_FULL") return { text: n.errors.full, problem: true };
    if (code === "NOT_NOTE_AUTHOR") return { text: n.errors.notAuthor, problem: true };
    return { text: n.errors.failed, problem: true };
  }

  const problem = (value: string) => (size(value) === 0 ? n.errors.empty : size(value) > NOTE_MAX ? fill(n.errors.long, { max: NOTE_MAX }) : null);

  function change(value: string) {
    setText(value);
    // an error that is showing goes the moment the text is fixed
    if (error && !problem(value)) setError(null);
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (sending || refreshing) return;
    const found = problem(text);
    setError(found);
    if (found) {
      area.current?.focus();
      return;
    }
    setSending(true);
    setLine(null);
    try {
      const made = await addNote(hub.id, text.trim());
      setNotes((have) => have && (have.some((note) => note.id === made.id) ? have : [...have, made]));
      setArrived(made.id);
      setText("");
      say({ text: n.write.added });
    } catch (reason) {
      const sentence = refused(reason);
      if (sentence) say(sentence);
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    if (!target || deleting) return;
    const gone = target;
    setDeleting(true);
    setLine(null);
    try {
      await deleteNote(hub.id, gone.id);
      setNotes((have) => have && have.filter((note) => note.id !== gone.id));
      say({ text: n.delete.done, focus: true });
    } catch (reason) {
      if (reason instanceof IdeaError && reason.status === 404) {
        setNotes((have) => have && have.filter((note) => note.id !== gone.id));
        say({ text: n.delete.gone, focus: true });
      } else {
        const sentence = refused(reason);
        if (sentence) say(sentence);
      }
    } finally {
      setDeleting(false);
      setTarget(null);
    }
  }

  const editable = hub.status === "active" && hub.phase === "brainstorm";
  const closed = hub.status === "archived" ? n.archived : editable ? null : n.over;
  const describe = `note-text-help${error ? " note-text-error" : ""}`;

  return (
    <section id="brainstorm" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{n.heading}</h2>
      {closed && <p className={ideas.lead}>{closed}</p>}
      {failed && <LoadFailed text={n.loadFailed} retry={t.retry} onRetry={() => reload(true)} />}
      {notes === null ? (
        !failed && (
          <div aria-busy="true">
            <p className={landing.srOnly} role="status">
              {n.loading}
            </p>
            <div className={`${onboarding.skeleton} ${styles.pending}`} aria-hidden="true">
              <div className={onboarding.block} />
              <div className={onboarding.block} />
            </div>
          </div>
        )
      ) : (
        <>
          {notes.length === 0 ? (
            <p className={`${ideas.meta} ${styles.line}`}>{editable ? n.empty : n.emptyAfter}</p>
          ) : (
            <ul className={styles.notes}>
              {notes.map((note) => (
                <li key={note.id} className={styles.note} data-arrived={note.id === arrived || undefined}>
                  <p className={styles.noteText}>{note.body}</p>
                  {editable && note.can_delete && (
                    <button
                      type="button"
                      className={styles.noteRemove}
                      aria-label={fill(n.delete.label, { name: note.author.display_name })}
                      onClick={() => setTarget(note)}
                    >
                      <X />
                      <Tooltip label={fill(n.delete.label, { name: note.author.display_name })} />
                    </button>
                  )}
                  <p className={styles.noteBy}>
                    <span>{note.author.display_name}</span>
                    <time dateTime={note.created_at}>{when(note.created_at, now, lang)}</time>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.phaseActions}>
            <button
              type="button"
              className={landing.ghost}
              aria-busy={refreshing || undefined}
              aria-disabled={sending || undefined}
              onClick={() => reload(false)}
            >
              {n.refresh}
            </button>
          </div>
        </>
      )}
      {line &&
        (line.demo ? (
          <NotSaved key={line.n} lang={lang} spaced />
        ) : line.problem ? (
          <p key={line.n} ref={said} tabIndex={-1} className={`${onboarding.error} ${styles.problem}`} role="alert">
            <AlertCircle />
            {line.text}
          </p>
        ) : (
          <p key={line.n} ref={said} tabIndex={-1} className={ideas.done} role="status">
            <Check />
            {line.text}
          </p>
        ))}
      {editable && notes && (
        <form className={styles.noteForm} noValidate onSubmit={add}>
          <Field id="note-text" label={n.write.label} help={n.write.help} error={error ?? undefined} count={fill(n.write.left, { n: NOTE_MAX - size(text) })}>
            <textarea
              ref={area}
              id="note-text"
              className={`${onboarding.input} ${ideas.area}`}
              rows={3}
              value={text}
              aria-invalid={!!error || undefined}
              aria-describedby={describe}
              onChange={(event) => change(event.target.value)}
            />
          </Field>
          <div className={styles.phaseActions}>
            <button type="submit" className={landing.ghost} aria-busy={sending || undefined} aria-disabled={refreshing || undefined}>
              {n.write.add}
            </button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={!!target}
        title={n.delete.title}
        confirm={n.delete.confirm}
        cancel={n.delete.cancel}
        danger
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setTarget(null)}
      >
        <p>{n.delete.text}</p>
      </ConfirmDialog>
    </section>
  );
}
