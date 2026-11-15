"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { when } from "../feed/post-parts";
import { Field } from "../ideas/composer";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, X } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { LoadFailed } from "./form-parts";
import { loadHub, loadMessages, MESSAGE_MAX, sendMessage, type Hub, type Message } from "./hubs-api";
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

  // The sentence for a refused or failed write, or null when the frame already says why.
  function refused(reason: unknown): Line | null {
    if (reason instanceof SignedOutError) return null;
    const code = reason instanceof IdeaError ? reason.code : "";
    // in the demo the frame says why; "try again" would be wrong
    if (code === "DEMO_READ_ONLY") return null;
    if (CHANGED.includes(code)) {
      // show the hub as it is now; the line already says what happened
      loadHub(hub.id).then(onChange, () => {});
      return { text: c.errors.changed, problem: true, focus: true };
    }
    return { text: c.errors.failed, problem: true };
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
                  <p className={styles.noteText}>{message.body}</p>
                  {writable && (
                    <div className={styles.messageActions}>
                      <button
                        type="button"
                        className={landing.ghost}
                        aria-label={fill(c.reply.label, { name: message.author.display_name })}
                        onClick={() => reply(message)}
                      >
                        {c.reply.button}
                      </button>
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
    </section>
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
