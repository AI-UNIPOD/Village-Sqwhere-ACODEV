"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { copy, fill } from "./copy";
import { AlertCircle, Check, SearchX } from "./icons";
import styles from "./onboarding.module.css";
import { ROLES, TECHNOLOGIES, TOPICS, countriesFor } from "./options";
import type { Answers } from "./steps";

type StepProps = {
  lang: Lang;
  answers: Answers;
  update: (patch: Partial<Answers>) => void;
  /** The required answer is missing and the person pressed Continue. */
  error: boolean;
};

// The item's place in its list: the arrival stagger reads it as --i.
const place = (i: number) => ({ "--i": i }) as CSSProperties;

// "Sénégal" is found by "senegal": letters lose their accents and their case.
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const matches = (name: string, query: string) => plain(name).includes(plain(query.trim()));

const toggle = (list: string[], slug: string) =>
  list.includes(slug) ? list.filter((item) => item !== slug) : [...list, slug];

const describedBy = (id: string, error: boolean) => `${id}-why${error ? ` ${id}-error` : ""}`;

function Head({ id, title, why }: { id: string; title: string; why: string }) {
  return (
    <>
      {/* focus moves here after a step change, so the new screen is read from its start */}
      <h1 id={`${id}-title`} className={styles.title} tabIndex={-1}>
        {title}
      </h1>
      <p id={`${id}-why`} className={styles.why}>
        {why}
      </p>
    </>
  );
}

function ErrorNote({ id, children }: { id: string; children: string }) {
  return (
    <p id={`${id}-error`} className={styles.error} role="alert">
      <AlertCircle />
      {children}
    </p>
  );
}

function Filter(props: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const { id, label, value, onChange } = props;
  return (
    <div className={styles.filter}>
      <label htmlFor={`${id}-filter`} className={styles.filterLabel}>
        {label}
      </label>
      <input
        id={`${id}-filter`}
        type="search"
        className={styles.input}
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NoMatch(props: { lang: Lang; text: string; query: string; onClear: () => void }) {
  const { lang, text, query, onClear } = props;
  const t = copy[lang].empty;
  return (
    <div className={styles.empty} role="status">
      <SearchX className={styles.emptyIcon} />
      <h2 className={styles.emptyTitle}>{t.title}</h2>
      <p>{fill(text, { query: query.trim() })}</p>
      <button type="button" className={landing.ghost} onClick={onClear}>
        {t.clear}
      </button>
    </div>
  );
}

type ChipOption = { slug: string; label: string };

function ChipGroup(props: {
  id: string;
  options: ChipOption[];
  selected: string[];
  onToggle: (slug: string) => void;
  mono?: boolean;
  describedBy?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={`${props.id}-title`}
      aria-describedby={props.describedBy}
      className={styles.chips}
    >
      {props.options.map((option) => {
        const on = props.selected.includes(option.slug);
        return (
          <button
            key={option.slug}
            type="button"
            className={`${styles.chip} ${props.mono ? styles.mono : ""}`}
            aria-pressed={on}
            onClick={() => props.onToggle(option.slug)}
          >
            {on && <Check />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function Choice(props: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  index?: number;
  children: ReactNode;
}) {
  const { name, value, checked, onChange, index, children } = props;
  return (
    <label className={styles.choice} style={index === undefined ? undefined : place(index)}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      {children}
      <Check className={styles.tick} />
    </label>
  );
}

export function RoleStep({ lang, answers, update, error }: StepProps) {
  const t = copy[lang].role;
  return (
    <>
      <Head id="role" title={t.title} why={t.why} />
      <fieldset className={styles.group} aria-describedby={describedBy("role", error)}>
        <legend className={landing.srOnly}>{t.title}</legend>
        <div className={styles.roleList}>
          {ROLES.map((role, i) => (
            <Choice
              key={role.slug}
              name="role"
              value={role.slug}
              index={i}
              checked={answers.role === role.slug}
              onChange={() => update({ role: role.slug })}
            >
              <span className={styles.choiceText}>
                <span className={styles.choiceName}>{role.name[lang]}</span>
                <span className={styles.choiceHint}>{role.hint[lang]}</span>
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>
      {error && <ErrorNote id="role">{t.error}</ErrorNote>}
    </>
  );
}

export function StackStep({ lang, answers, update, error }: StepProps) {
  const t = copy[lang];
  const [query, setQuery] = useState("");
  const options = TECHNOLOGIES.filter((tech) => matches(tech.name, query)).map((tech) => ({
    slug: tech.slug,
    label: tech.name,
  }));
  return (
    <>
      <Head id="stack" title={t.stack.title} why={t.stack.why} />
      <Filter id="stack" label={t.stack.filter} value={query} onChange={setQuery} />
      <p className={styles.selected} role="status">
        {fill(t.stack.selected, { n: answers.stack.length })}
      </p>
      {options.length > 0 ? (
        <ChipGroup
          id="stack"
          mono
          options={options}
          selected={answers.stack}
          onToggle={(slug) => update({ stack: toggle(answers.stack, slug) })}
          describedBy={describedBy("stack", error)}
        />
      ) : (
        <NoMatch lang={lang} text={t.empty.stack} query={query} onClear={() => setQuery("")} />
      )}
      {error && <ErrorNote id="stack">{t.stack.error}</ErrorNote>}
    </>
  );
}

export function CountryStep({ lang, answers, update }: StepProps) {
  const t = copy[lang];
  const [query, setQuery] = useState("");
  const countries = countriesFor(lang).filter((country) => matches(country.name, query));
  return (
    <>
      <Head id="country" title={t.country.title} why={t.country.why} />
      <Filter id="country" label={t.country.filter} value={query} onChange={setQuery} />
      {countries.length > 0 ? (
        <fieldset className={styles.group} aria-describedby="country-why">
          <legend className={landing.srOnly}>{t.country.title}</legend>
          <div className={styles.countryList}>
            {countries.map((country) => (
              <Choice
                key={country.code}
                name="country"
                value={country.code}
                checked={answers.country === country.code}
                onChange={() => update({ country: country.code })}
              >
                <span className={styles.choiceName}>{country.name}</span>
              </Choice>
            ))}
          </div>
        </fieldset>
      ) : (
        <NoMatch lang={lang} text={t.empty.country} query={query} onClear={() => setQuery("")} />
      )}
    </>
  );
}

export function TopicsStep({ lang, answers, update }: StepProps) {
  const t = copy[lang].topics;
  return (
    <>
      <Head id="topics" title={t.title} why={t.why} />
      <div className={styles.group}>
        <ChipGroup
          id="topics"
          options={TOPICS.map((topic) => ({ slug: topic.slug, label: topic.name[lang] }))}
          selected={answers.topics}
          onToggle={(slug) => update({ topics: toggle(answers.topics, slug) })}
          describedBy="topics-why"
        />
      </div>
    </>
  );
}
