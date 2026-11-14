"use client";

import { useState } from "react";

import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { TECHNOLOGIES, TOPICS } from "../onboarding/options";
import type { Me } from "../session/me";
import { SignedOutError } from "../session/session";
import { copy, type Choices } from "./copy";
import { saveSectors, saveStack } from "./profile-api";
import styles from "./profile.module.css";

type Picked = { slug: string; name: string }[];

type ChoicesProps = {
  id: string;
  lang: Lang;
  t: Choices;
  options: ReadonlyArray<{ slug: string; name: Record<Lang, string> }>;
  held: Picked;
  save: (slugs: string[]) => Promise<Picked>;
  onSaved: (picked: Picked) => void;
};

// A list of chips saved as a whole. The whole list is sent on save, and the selection stays on
// screen when that fails.
function ChoicesSection({ id, lang, t, options, held: heldList, save: send, onSaved }: ChoicesProps) {
  const [picked, setPicked] = useState(() => heldList.map((item) => item.slug));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  const held = new Set(heldList.map((item) => item.slug));
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
      onSaved(await send(options.map((option) => option.slug).filter((slug) => picked.includes(slug))));
      setSaved(true);
    } catch (error) {
      if (!(error instanceof SignedOutError)) setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={ideas.section} aria-labelledby={id}>
      <h2 id={id} className={ideas.heading}>
        {t.heading}
      </h2>
      <p className={ideas.lead}>{t.lead}</p>
      <div role="group" aria-labelledby={id} className={`${onboarding.chips} ${styles.stackChips}`}>
        {options.map((option) => (
          <button
            key={option.slug}
            type="button"
            className={onboarding.chip}
            aria-pressed={picked.includes(option.slug)}
            onClick={() => toggle(option.slug)}
          >
            {option.name[lang]}
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

type SectionProps = { lang: Lang; me: Me; onMe: (me: Me) => void };

// The technologies a developer builds with.
export function StackSection({ lang, me, onMe }: SectionProps) {
  return (
    <ChoicesSection
      id="profile-stack"
      lang={lang}
      t={copy[lang].stack}
      options={TECHNOLOGIES}
      held={me.technologies}
      save={saveStack}
      onSaved={(technologies) => onMe({ ...me, technologies })}
    />
  );
}

// The areas a developer wants to build ideas in, first chosen in onboarding.
export function SectorsSection({ lang, me, onMe }: SectionProps) {
  return (
    <ChoicesSection
      id="profile-sectors"
      lang={lang}
      t={copy[lang].sectors}
      options={TOPICS}
      held={me.sectors}
      save={saveSectors}
      onSaved={(sectors) => onMe({ ...me, sectors })}
    />
  );
}
