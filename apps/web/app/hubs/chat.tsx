"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { when } from "../feed/post-parts";
import { Field } from "../ideas/composer";
import { DEMO_READ_ONLY, notSaved } from "../demo-refusal";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, X } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { Tooltip } from "../tooltip";
import { copy } from "./copy";
import { LoadFailed } from "./form-parts";
import { ConfirmDialog } from "../confirm-dialog";
import { deleteMessage, editMessage, loadHub, loadMessages, MESSAGE_MAX, sendMessage, type Hub, type Message } from "./hubs-api";
import styles from "./hubs.module.css";

// The person was removed or the hub was archived while the page was open: the chat is read only now.
const CHANGED = ["HUB_ARCHIVED", "HUB_CHANGED", "NOT_HUB_MEMBER"];

// What the API counts: the characters of the trimmed text, an emoji being one.
const size = (text: string) => [...text.trim()].length;

// `focus` is for a line that replaces the button that was pressed, so focus does not fall to the page.
type Line = { text: string; problem?: boolean; focus?: boolean };

// Adds messages to the ones shown, oldest first, keeping one copy of each.
function merge(have: Message[], more: Message[]): Message[] {
  const known = new Set(have.map((message) => message.id));
  return [...have, ...more.filter((message) => !known.has(message.id))].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// Puts a changed message in its place, and its new text, or null once deleted, in the replies that quote it.
function settle(have: Message[], id: string, changed: Message | null): Message[] {
  return have.flatMap((message) => {
    if (message.id === id) return changed ? [changed] : [];
    if (message.reply_to?.id !== id) return [message];
    return [{ ...message, reply_to: { ...message.reply_to, body: changed ? changed.body : null } }];
  });
}

// The hub's chat, for its active members in every phase. The API sends the newest page first;
// the page shows it oldest first, like any chat, with earlier pages loaded on request.
// There are no live updates: the chat is read when the section shows and on Refresh.
export function Chat({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const c = copy[lang].hubChat;
  const t = copy[lang];
  const [messages, setMessages] = useState<Message[] | null>(null);
  // where the next earlier page starts, or null when the first message is shown
  const [earlier, setEarlier] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [line, setLine] = useState<(Line & { n: number }) | null>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [quoting, setQuoting] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // the one message being edited, and the one the person is being asked about deleting
  const [editing, setEditing] = useState<string | null>(null);
  const [target, setTarget] = useState<Message | null>(null);
  const [deleting, setDeleting] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const moveFocus = useRef(false);

  // a new object each time, so the same sentence twice is still announced
  const say = useCallback((found: Line) => setLine((have) => ({ ...found, n: (have?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (line?.focus) said.current?.focus();
  }, [line]);

  useEffect(() => {
    let live = true;
    loadMessages(hub.id).then(
      (page) => {
        if (!live) return;
        setMessages(merge([], page.data));
        setEarlier(page.next_offset);
        setNow(Date.now());
        setFailed(false);
        setRefreshing(false);
        if (attempt > 0) say({ text: c.refreshed, focus: moveFocus.current });
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
  }, [hub.id, attempt, c, say]);

  function reload(focus: boolean) {
    // a page read while a message is on its way could miss it
    if (refreshing || sending) return;
    moveFocus.current = focus;
    setRefreshing(true);
    setLine(null);
    setAttempt((count) => count + 1);
  }

  async function showEarlier() {
    if (earlier === null || loadingEarlier) return;
    setLoadingEarlier(true);
    setLine(null);
    try {
      const page = await loadMessages(hub.id, earlier);
      setMessages((have) => have && merge(have, page.data));
      setEarlier(page.next_offset);
    } catch (reason) {
      if (!(reason instanceof SignedOutError)) say({ text: c.earlierFailed, problem: true });
    } finally {
      setLoadingEarlier(false);
    }
  }

  // The sentence for a refused or failed write, or null for a signed-out person, who is being sent to sign-in.
  function refused(reason: unknown): Line | null {
    if (reason instanceof SignedOutError) return null;
    const code = reason instanceof IdeaError ? reason.code : "";
    // the demo can never save it, so "try again" would be wrong
    if (code === DEMO_READ_ONLY) return { text: notSaved(lang), problem: true };
    if (CHANGED.includes(code)) {
      // show the hub as it is now; the line already says what happened
      loadHub(hub.id).then(onChange, () => {});
      return { text: c.errors.changed, problem: true, focus: true };
    }
    if (code === "NOT_MESSAGE_AUTHOR") return { text: c.errors.notAuthor, problem: true };
    return { text: c.errors.failed, problem: true };
  }

  // A message deleted elsewhere meanwhile: it leaves the list, and the line says so.
  function vanished(id: string) {
    setMessages((have) => have && settle(have, id, null));
    setEarlier((offset) => (offset === null ? null : Math.max(0, offset - 1)));
    say({ text: c.delete.gone, focus: true });
  }

  // Answers whether the edit is over, so the form closes only once the text is saved or gone.
  async function save(message: Message, body: string): Promise<boolean> {
    setLine(null);
    try {
      const changed = await editMessage(hub.id, message.id, body);
      setMessages((have) => have && settle(have, message.id, changed));
      setEditing(null);
      say({ text: c.edit.saved });
      return true;
    } catch (reason) {
      if (reason instanceof IdeaError && reason.code === "MESSAGE_NOT_FOUND") {
        setEditing(null);
        vanished(message.id);
        return true;
      }
      const sentence = refused(reason);
      if (sentence) say(sentence);
      return false;
    }
  }

  async function remove() {
    if (!target || deleting) return;
    const gone = target;
    setDeleting(true);
    setLine(null);
    try {
      await deleteMessage(hub.id, gone.id);
      setMessages((have) => have && settle(have, gone.id, null));
      // one message fewer before the earlier ones
      setEarlier((offset) => (offset === null ? null : Math.max(0, offset - 1)));
      if (quoting?.id === gone.id) setQuoting(null);
      say({ text: c.delete.done, focus: true });
    } catch (reason) {
      if (reason instanceof IdeaError && reason.code === "MESSAGE_NOT_FOUND") vanished(gone.id);
      else {
        const sentence = refused(reason);
        if (sentence) say(sentence);
      }
    } finally {
      setDeleting(false);
      setTarget(null);
    }
  }

  const problem = (value: string) => (size(value) === 0 ? c.errors.empty : size(value) > MESSAGE_MAX ? fill(c.errors.long, { max: MESSAGE_MAX }) : null);

  function change(value: string) {
    setText(value);
    if (error && !problem(value)) setError(null);
  }

  function reply(message: Message) {
    setQuoting(message);
    area.current?.focus();
  }

  async function send(event: FormEvent) {
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
      const made = await sendMessage(hub.id, { body: text.trim(), ...(quoting ? { reply_to_id: quoting.id } : {}) });
      setMessages((have) => have && merge(have, [made]));
      // the new message pushed every earlier one a place further from the newest
      setEarlier((offset) => (offset === null ? null : offset + 1));
      setArrived(made.id);
      setText("");
      setQuoting(null);
      say({ text: c.write.sent });
    } catch (reason) {
      if (reason instanceof IdeaError && reason.code === "MESSAGE_NOT_FOUND") {
        setQuoting(null);
        say({ text: c.errors.quoteGone, problem: true });
      } else {
        const sentence = refused(reason);
        if (sentence) say(sentence);
      }
    } finally {
      setSending(false);
    }
  }

  const writable = hub.status === "active";
  const describe = `chat-text-help${error ? " chat-text-error" : ""}`;

  return (
    <section id="chat" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{c.heading}</h2>
      <p className={ideas.lead}>{writable ? c.intro : c.archived}</p>
      {failed && <LoadFailed text={c.loadFailed} retry={t.retry} onRetry={() => reload(true)} />}
      {messages === null ? (
        !failed && (
          <div aria-busy="true">
            <p className={landing.srOnly} role="status">
              {c.loading}
            </p>
            <div className={`${onboarding.skeleton} ${styles.pending}`} aria-hidden="true">
              <div className={onboarding.block} />
              <div className={onboarding.block} />
            </div>
          </div>
        )
      ) : (
        <>
          {earlier !== null && (
            <div className={styles.phaseActions}>
              <button type="button" className={landing.ghost} aria-busy={loadingEarlier || undefined} onClick={showEarlier}>
                {c.earlier}
              </button>
            </div>
          )}
          {messages.length === 0 ? (
            <p className={`${ideas.meta} ${styles.line}`}>{writable ? c.empty : c.emptyArchived}</p>
          ) : (
            <ol className={styles.chat}>
              {messages.map((message) => (
                <li key={message.id} className={styles.message} data-arrived={message.id === arrived || undefined}>
                  <p className={styles.noteBy}>
                    <span className={styles.messageAuthor}>{message.author.display_name}</span>
                    <time dateTime={message.created_at}>{when(message.created_at, now, lang)}</time>
                    {message.edited_at && <span>{c.edited}</span>}
                  </p>
                  {message.reply_to && <Quote lang={lang} quote={message.reply_to} />}
                  {editing === message.id ? (
                    <EditForm lang={lang} message={message} problem={problem} onSave={(body) => save(message, body)} onCancel={() => setEditing(null)} />
                  ) : (
                    <p className={styles.noteText}>{message.body}</p>
                  )}
                  {writable && editing !== message.id && (
                    <div className={styles.messageActions}>
                      <button
                        type="button"
                        className={landing.ghost}
                        aria-label={fill(c.reply.label, { name: message.author.display_name })}
                        onClick={() => reply(message)}
                      >
                        {c.reply.button}
                      </button>
                      {message.can_edit && (
                        <button type="button" className={landing.ghost} aria-label={c.edit.label} onClick={() => setEditing(message.id)}>
                          {c.edit.button}
                        </button>
                      )}
                      {message.can_delete && (
                        <button
                          type="button"
                          className={styles.noteRemove}
                          aria-label={fill(c.delete.label, { name: message.author.display_name })}
                          onClick={() => setTarget(message)}
                        >
                          <X />
                          <Tooltip label={fill(c.delete.label, { name: message.author.display_name })} />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div className={styles.phaseActions}>
            <button
              type="button"
              className={landing.ghost}
              aria-busy={refreshing || undefined}
              aria-disabled={sending || undefined}
              onClick={() => reload(false)}
            >
              {c.refresh}
            </button>
          </div>
        </>
      )}
      {line &&
        (line.problem ? (
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
      {writable && messages && (
        <form className={styles.noteForm} noValidate onSubmit={send}>
          {quoting && (
            <div className={styles.replying}>
              <p className={ideas.meta}>{fill(c.reply.replying, { name: quoting.author.display_name })}</p>
              <button type="button" className={styles.noteRemove} aria-label={c.reply.cancel} onClick={() => setQuoting(null)}>
                <X />
              </button>
            </div>
          )}
          <Field id="chat-text" label={c.write.label} help={c.write.help} error={error ?? undefined} count={fill(c.write.left, { n: MESSAGE_MAX - size(text) })}>
            <textarea
              ref={area}
              id="chat-text"
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
              {c.write.send}
            </button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={!!target}
        title={c.delete.title}
        confirm={c.delete.confirm}
        cancel={c.delete.cancel}
        danger
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setTarget(null)}
      >
        <p>{c.delete.text}</p>
      </ConfirmDialog>
    </section>
  );
}

// The author's own message, opened for a change in its place. Saving the same text is allowed.
function EditForm(props: {
  lang: Lang;
  message: Message;
  problem: (value: string) => string | null;
  onSave: (body: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { lang, message, problem, onSave, onCancel } = props;
  const c = copy[lang].hubChat;
  const [text, setText] = useState(message.body);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const id = `chat-edit-${message.id}`;

  useEffect(() => area.current?.focus(), []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const found = problem(text);
    setError(found);
    if (found) {
      area.current?.focus();
      return;
    }
    setSaving(true);
    // the form stays when the save fails, so the text is not lost
    if (!(await onSave(text.trim()))) setSaving(false);
  }

  return (
    <form noValidate onSubmit={submit}>
      <Field id={id} label={c.edit.field} help={c.write.help} error={error ?? undefined} count={fill(c.write.left, { n: MESSAGE_MAX - size(text) })}>
        <textarea
          ref={area}
          id={id}
          className={`${onboarding.input} ${ideas.area}`}
          rows={3}
          value={text}
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={(event) => {
            setText(event.target.value);
            if (error && !problem(event.target.value)) setError(null);
          }}
        />
      </Field>
      <div className={styles.messageActions}>
        <button type="submit" className={landing.ghost} aria-busy={saving || undefined}>
          {c.edit.save}
        </button>
        <button type="button" className={landing.ghost} onClick={onCancel}>
          {c.edit.cancel}
        </button>
      </div>
    </form>
  );
}

// The message a reply quotes: who wrote it and its text, or that it was deleted.
function Quote({ lang, quote }: { lang: Lang; quote: NonNullable<Message["reply_to"]> }) {
  const c = copy[lang].hubChat;
  return (
    <blockquote className={styles.quote}>
      <p className={ideas.meta}>{fill(c.quoteBy, { name: quote.author.display_name })}</p>
      <p className={styles.quoteText}>{quote.body ?? c.quoteGone}</p>
    </blockquote>
  );
}
