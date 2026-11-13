"use client";

import { useState } from "react";

import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { TECHNOLOGIES } from "../onboarding/options";
import type { Me } from "../session/me";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { saveStack } from "./profile-api";
import styles from "./profile.module.css";

// The technologies a developer builds with. The whole list is sent on save, and the selection
// stays on screen when that fails.
export function StackSection({ lang, me, onMe }: { lang: Lang; me: Me; onMe: (me: Me) => void }) {
  const t = copy[lang].stack;
  const [picked, setPicked] = useState(() => me.technologies.map((tech) => tech.slug));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  const held = new Set(me.technologies.map((tech) => tech.slug));
  const dirty = picked.length !== held.size || picked.some((slug) => !held.has(slug));

  function toggle(slug: string) {
    setPicked((now) => (now.includes(slug) ? now.filter((other) => other !== slug) : [...now, slug]));
    setSaved(false);
    setFailed(false);
  }

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      // in the order of the list, as onboarding saves it
      const technologies = await saveStack(TECHNOLOGIES.map((tech) => tech.slug).filter((slug) => picked.includes(slug)));
      onMe({ ...me, technologies });
      setSaved(true);
    } catch (error) {
      if (!(error instanceof SignedOutError)) setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={ideas.section} aria-labelledby="profile-stack">
      <h2 id="profile-stack" className={ideas.heading}>
        {t.heading}
      </h2>
      <p className={ideas.lead}>{t.lead}</p>
      <div role="group" aria-labelledby="profile-stack" className={`${onboarding.chips} ${styles.stackChips}`}>
        {TECHNOLOGIES.map((tech) => (
          <button
            key={tech.slug}
            type="button"
            className={`${onboarding.chip} ${styles.chip}`}
            aria-pressed={picked.includes(tech.slug)}
            onClick={() => toggle(tech.slug)}
          >
            {tech.name[lang]}
          </button>
        ))}
      </div>
      <p className={onboarding.selected} role="status">
        {fill(t.selected, { n: picked.length })}
      </p>
      <div className={`${onboarding.actions} ${styles.bar}`}>
        {failed && (
          <p className={`${onboarding.error} ${styles.failed}`} role="alert">
            <AlertCircle />
            {t.failed}
          </p>
        )}
        <button
          type="button"
          className={landing.ghost}
          aria-disabled={!dirty || undefined}
          aria-busy={busy || undefined}
          onClick={save}
        >
          {t.save}
        </button>
        <p className={`${ideas.saved} ${styles.saved}`} role="status">
          {saved && (
            <span>
              <Check />
              {t.saved}
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
