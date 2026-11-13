"use client";

import { useState, type ReactNode } from "react";

import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { toProfile } from "../onboarding/options";
import type { Me } from "../session/me";
import { SignedOutError } from "../session/session";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { saveProfile } from "./profile-api";
import styles from "./profile.module.css";

const LIMITS = { nameMax: 80, bioMax: 1000 };

type Errors = { name?: string; bio?: string };

function validate(name: string, bio: string, t: (typeof copy)[Lang]["you"]): Errors {
  const errors: Errors = {};
  if (name.trim().length < 1 || name.trim().length > LIMITS.nameMax) errors.name = t.errors.name;
  if (bio.length > LIMITS.bioMax) errors.bio = t.errors.bio;
  return errors;
}

// The field the API names when it refuses a value, as this form calls it.
const FIELDS: Record<string, keyof Errors> = { display_name: "name", bio: "bio" };

function Field(props: {
  id: string;
  label: string;
  help: string;
  error?: string;
  count?: string;
  children: ReactNode;
}) {
  const { id, label, help, error, count, children } = props;
  return (
    <div className={ideas.field}>
      <label htmlFor={id} className={ideas.label}>
        {label}
      </label>
      {children}
      <p id={`${id}-help`} className={ideas.help}>
        {help}
        {count && <span className={ideas.count}>{count}</span>}
      </p>
      {error && (
        <p id={`${id}-error`} className={onboarding.error} role="alert">
          <AlertCircle />
          {error}
        </p>
      )}
    </div>
  );
}

function Person({ lang, me }: { lang: Lang; me: Me }) {
  const profile = toProfile(me);
  const shown = profile.displayName ?? profile.username;
  const github = (text: string) => (
    <a href={`https://github.com/${encodeURIComponent(profile.username)}`} target="_blank" rel="noopener noreferrer">
      {text} <span className={landing.srOnly}>({copy[lang].githubProfile})</span>
    </a>
  );
  return (
    <div className={`${village.person} ${styles.person}`}>
      <span className={village.avatar} aria-hidden="true">
        {shown
          .split(" ")
          .map((word) => word[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <div>
        <p className={village.name}>{profile.displayName ?? github(profile.username)}</p>
        {profile.displayName && <p className={village.username}>{github(`@${profile.username}`)}</p>}
      </div>
    </div>
  );
}

// The name and the bio others see. Only what changed is sent, and what the person typed stays
// in the fields when the save fails.
export function YouSection({ lang, me, onMe }: { lang: Lang; me: Me; onMe: (me: Me) => void }) {
  const t = copy[lang].you;
  const [name, setName] = useState(me.display_name);
  const [bio, setBio] = useState(me.bio ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);

  function edit(next: { name: string; bio: string }) {
    setName(next.name);
    setBio(next.bio);
    setSaved(false);
    // an error that is showing goes the moment the value is fixed; new ones wait for a save
    const found = validate(next.name, next.bio, t);
    setErrors((shown) => ({ name: shown.name && found.name, bio: shown.bio && found.bio }));
  }

  async function save() {
    if (busy) return;
    const found = validate(name, bio, t);
    setErrors(found);
    const first = found.name ? "name" : found.bio ? "bio" : null;
    if (first) {
      document.getElementById(`profile-${first}`)?.focus();
      return;
    }
    const changes = {
      ...(name.trim() !== me.display_name && { display_name: name.trim() }),
      ...(bio !== (me.bio ?? "") && { bio }),
    };
    if (Object.keys(changes).length > 0) {
      setBusy(true);
      setFailed(false);
      try {
        const profile = await saveProfile(changes);
        onMe(profile);
        setName(profile.display_name);
        setBio(profile.bio ?? "");
      } catch (error) {
        if (error instanceof SignedOutError) return;
        const field = error instanceof IdeaError ? FIELDS[error.field ?? ""] : undefined;
        if (field) {
          setErrors({ [field]: t.errors[field] });
          document.getElementById(`profile-${field}`)?.focus();
        } else setFailed(true);
        return;
      } finally {
        setBusy(false);
      }
    }
    setSaved(true);
  }

  const describe = (field: "name" | "bio") => `profile-${field}-help${errors[field] ? ` profile-${field}-error` : ""}`;
  // quiet until the text is within a tenth of its limit
  const count = (length: number, max: number) => (length > max * 0.9 ? fill(t.count, { n: length, max }) : undefined);

  return (
    <section className={ideas.section} aria-labelledby="profile-you">
      <h2 id="profile-you" className={ideas.heading}>
        {t.heading}
      </h2>
      <Person lang={lang} me={me} />
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Field
          id="profile-name"
          label={t.name.label}
          help={t.name.help}
          error={errors.name}
          count={count(name.length, LIMITS.nameMax)}
        >
          <input
            id="profile-name"
            className={onboarding.input}
            value={name}
            autoComplete="name"
            aria-invalid={!!errors.name || undefined}
            aria-describedby={describe("name")}
            onChange={(event) => edit({ name: event.target.value, bio })}
          />
        </Field>
        <Field
          id="profile-bio"
          label={t.bio.label}
          help={t.bio.help}
          error={errors.bio}
          count={count(bio.length, LIMITS.bioMax)}
        >
          <textarea
            id="profile-bio"
            className={`${onboarding.input} ${ideas.area}`}
            rows={4}
            value={bio}
            aria-invalid={!!errors.bio || undefined}
            aria-describedby={describe("bio")}
            onChange={(event) => edit({ name, bio: event.target.value })}
          />
        </Field>
        <div className={`${onboarding.actions} ${styles.bar}`}>
          {failed && (
            <p className={`${onboarding.error} ${styles.failed}`} role="alert">
              <AlertCircle />
              {t.errors.save}
            </p>
          )}
          <button type="submit" className={landing.btn} aria-busy={busy || undefined}>
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
      </form>
    </section>
  );
}
