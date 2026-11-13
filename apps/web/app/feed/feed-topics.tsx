"use client";

import { useEffect, useRef, useState } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { TECHNOLOGIES } from "../onboarding/options";
import { keepMe, type Me } from "../session/me";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { saveFeedTopics } from "./feed-api";
import styles from "./feed.module.css";

const place = (slug: string) => {
  const at = TECHNOLOGIES.findIndex((tech) => tech.slug === slug);
  return at < 0 ? TECHNOLOGIES.length : at;
};

// "Go", "Go and Python", "Go, Python and React", then "Go, Python and 2 more".
function listed(names: string[], t: (typeof copy)[Lang]["topics"]) {
  if (names.length === 1) return names[0];
  if (names.length <= 3) return fill(t.and, { list: names.slice(0, -1).join(", "), last: names[names.length - 1] });
  return fill(t.more, { list: names.slice(0, 2).join(", "), n: names.length - 2 });
}

// One quiet line that says what the feed shows, and the way to change it, in place: the choice
// opens under the line and closes back to the button. `onSaved` loads the feed again.
export function FeedTopics({ lang, me, onSaved }: { lang: Lang; me: Me; onSaved: () => void }) {
  const t = copy[lang].topics;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const held = [...me.feed_topics].sort((a, b) => place(a.slug) - place(b.slug));
  const names = held.map((topic) => TECHNOLOGIES.find((tech) => tech.slug === topic.slug)?.name[lang] ?? topic.name);

  // the choice is empty to the eye until it opens, so focus goes in once it is there
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("button")?.focus();
  }, [open]);

  function show() {
    setPicked(held.map((topic) => topic.slug));
    setFailed(false);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // in the order of the list, as the stack is saved
      const topics = await saveFeedTopics(TECHNOLOGIES.map((tech) => tech.slug).filter((slug) => picked.includes(slug)));
      keepMe({ ...me, feed_topics: topics });
      close();
      onSaved();
    } catch (error) {
      if (!(error instanceof SignedOutError)) setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.topics}>
      <div className={styles.topicsLine}>
        <p role="status">
          {held.length === 0 ? t.everyone : `${fill(t.about, { topics: listed(names, t) })}. ${t.own}`}
        </p>
        <button
          ref={button}
          type="button"
          className={landing.ghost}
          aria-expanded={open}
          aria-controls="feed-topics"
          onClick={() => (open ? close() : show())}
        >
          {held.length === 0 ? t.choose : t.change}
        </button>
      </div>
      <div
        ref={panel}
        id="feed-topics"
        className={styles.topicsPanel}
        hidden={!open}
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <p id="feed-topics-label" className={styles.topicsLabel}>
          {t.label}
        </p>
        <p className={styles.topicsHelp}>{t.help}</p>
        <div role="group" aria-labelledby="feed-topics-label" className={onboarding.chips}>
          {TECHNOLOGIES.map((tech) => (
            <button
              key={tech.slug}
              type="button"
              className={onboarding.chip}
              aria-pressed={picked.includes(tech.slug)}
              onClick={() => setPicked((now) => (now.includes(tech.slug) ? now.filter((other) => other !== tech.slug) : [...now, tech.slug]))}
            >
              {tech.name[lang]}
            </button>
          ))}
        </div>
        {failed && (
          <p className={onboarding.error} role="alert">
            <AlertCircle />
            {t.failed}
          </p>
        )}
        <div className={onboarding.actions}>
          <button type="button" className={landing.ghost} aria-busy={busy || undefined} onClick={save}>
            {t.save}
          </button>
          <button type="button" className={landing.ghost} onClick={close}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
