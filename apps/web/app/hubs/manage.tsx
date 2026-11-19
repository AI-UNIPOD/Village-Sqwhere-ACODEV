"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { NotSaved, isDemoRefusal } from "../demo-refusal";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { FieldError } from "./form-parts";
import { archiveHub, editHub, LIMITS, loadHub, type Hub } from "./hubs-api";
import styles from "./hubs.module.css";

// The hub was archived, or changed hands, in another tab: show it as it is now.
const CHANGED = ["HUB_ARCHIVED", "NOT_HUB_OWNER"];

// What happened, for the page to say once the hub card is replaced.
export type Managed = "saved" | "archived" | "changed";

// The owner renames or describes an active hub in place. Terms are never edited: every member signed them.
export function EditHub({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub, done: Managed) => void }) {
  const t = copy[lang];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(hub.name);
  const [description, setDescription] = useState(hub.description ?? "");
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [failed, setFailed] = useState<boolean | "demo">(false);
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) nameInput.current?.focus();
  }, [open]);

  function start() {
    setName(hub.name);
    setDescription(hub.description ?? "");
    setErrors({});
    setFailed(false);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    // the form goes, so the button that opened it takes the focus back
    requestAnimationFrame(() => toggle.current?.focus());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmed = name.trim();
    const found = {
      name: trimmed.length === 0 ? t.errors.nameRequired : trimmed.length > LIMITS.nameMax ? t.errors.nameLong : undefined,
      description: description.trim().length > LIMITS.descriptionMax ? t.errors.descriptionLong : undefined,
    };
    setErrors(found);
    if (found.name || found.description) {
      document.getElementById(found.name ? "hub-edit-name" : "hub-edit-description")?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      onChange(await editHub(hub.id, { name: trimmed, description: description.trim() || null }), "saved");
      setOpen(false);
    } catch (error) {
      if (error instanceof SignedOutError) return;
      if (isDemoRefusal(error)) return setFailed("demo");
      if (error instanceof IdeaError && CHANGED.includes(error.code)) loadHub(hub.id).then((card) => onChange(card, "changed"), () => setFailed(true));
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <p className={styles.line}>
        <button ref={toggle} type="button" className={landing.ghost} onClick={start}>
          {t.manage.edit}
        </button>
      </p>
    );

  const describe = (field: "name" | "description") => `hub-edit-${field}-help${errors[field] ? ` hub-edit-${field}-error` : ""}`;
  return (
    <form className={styles.noteForm} noValidate onSubmit={save}>
      <div className={ideas.field}>
        <label htmlFor="hub-edit-name" className={ideas.label}>
          {t.name.label}
        </label>
        <input
          ref={nameInput}
          id="hub-edit-name"
          className={onboarding.input}
          value={name}
          autoComplete="off"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={describe("name")}
          onChange={(event) => setName(event.target.value)}
        />
        <p id="hub-edit-name-help" className={ideas.help}>
          {t.name.help}
        </p>
        <FieldError id="hub-edit-name">{errors.name}</FieldError>
      </div>
      <div className={ideas.field}>
        <label htmlFor="hub-edit-description" className={ideas.label}>
          {t.description.label}
        </label>
        <textarea
          id="hub-edit-description"
          className={`${onboarding.input} ${ideas.area}`}
          rows={4}
          value={description}
          aria-invalid={!!errors.description || undefined}
          aria-describedby={describe("description")}
          onChange={(event) => setDescription(event.target.value)}
        />
        <p id="hub-edit-description-help" className={ideas.help}>
          {t.description.help}
        </p>
        <FieldError id="hub-edit-description">{errors.description}</FieldError>
      </div>
      {failed === "demo" && <NotSaved lang={lang} spaced />}
      {failed === true && (
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {t.manage.failed}
        </p>
      )}
      <div className={styles.phaseActions}>
        <button type="submit" className={landing.btn} aria-busy={busy || undefined}>
          {t.manage.save}
        </button>
        <button type="button" className={landing.ghost} onClick={close}>
          {t.manage.cancel}
        </button>
      </div>
    </form>
  );
}

// The owner archives an active hub for good, behind a confirmation.
export function ArchiveHub({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub, done: Managed) => void }) {
  const t = copy[lang].manage;
  const a = t.archive;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<boolean | "demo">(false);

  async function archive() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      onChange(await archiveHub(hub.id), "archived");
    } catch (error) {
      if (error instanceof SignedOutError) return;
      if (isDemoRefusal(error)) return setFailed("demo");
      // archived already, or no longer the owner's: the hub as it is now says enough
      if (error instanceof IdeaError && CHANGED.includes(error.code)) loadHub(hub.id).then((card) => onChange(card, "changed"), () => setFailed(true));
      else setFailed(true);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <section id="archive" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{a.heading}</h2>
      <p className={styles.text}>{a.text}</p>
      {failed === "demo" && <NotSaved lang={lang} spaced />}
      {failed === true && (
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {t.failed}
        </p>
      )}
      <div className={styles.phaseActions}>
        <button type="button" className={landing.ghost} onClick={() => setAsking(true)}>
          {a.button}
        </button>
      </div>
      <ConfirmDialog open={asking} title={a.title} confirm={a.confirm} cancel={a.cancel} danger busy={busy} onConfirm={archive} onCancel={() => setAsking(false)}>
        <p>{a.dialog}</p>
      </ConfirmDialog>
    </section>
  );
}
