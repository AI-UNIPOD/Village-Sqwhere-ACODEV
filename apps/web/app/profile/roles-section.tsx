"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { AlertCircle, Check, CircleDashed, Clock, Flag } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { ROLES } from "../onboarding/options";
import { loadMe, type Me, type MeRole } from "../session/me";
import { SignedOutError } from "../session/session";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { addRole, makeMainRole, removeRole } from "./profile-api";
import styles from "./profile.module.css";

const place = (role: MeRole) => ROLES.findIndex((known) => known.slug === role.slug);

function verification(role: MeRole) {
  if (role.verified_at) return { state: "done", Icon: Check, label: "verified" } as const;
  if (["pending", "in_progress", "awaiting_review"].includes(role.verification.latest_status ?? "")) {
    return { state: "next", Icon: Clock, label: "beingVerified" } as const;
  }
  return { state: "later", Icon: CircleDashed, label: "notVerified" } as const;
}

// The roles a developer holds, one change at a time. After each change the profile is loaded
// again, so the list is what the API holds.
export function RolesSection({ lang, me, onMe }: { lang: Lang; me: Me; onMe: (me: Me) => void }) {
  const t = copy[lang].roles;
  // what is being sent ("add:<slug>"), the role a confirmation is open for, and the sentence
  // under the role it went wrong for
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ slug: string; text: string } | null>(null);
  // the role just added: only that one rises in
  const [arrived, setArrived] = useState<string | null>(null);
  // after a change the pressed button is gone, so focus goes where the change shows
  const focus = useRef<string | null>(null);
  useEffect(() => {
    if (focus.current) document.getElementById(focus.current)?.focus();
    focus.current = null;
  });

  async function change(key: string, slug: string, action: () => Promise<unknown>, failure: string, focusId: string) {
    if (busy) return;
    setBusy(key);
    setProblem(null);
    try {
      await action();
      onMe(await loadMe());
      focus.current = focusId;
      if (key.startsWith("add:")) setArrived(slug);
    } catch (error) {
      if (error instanceof SignedOutError) return;
      const code = error instanceof IdeaError ? error.code : null;
      // added from another tab a moment ago: the role is there, so show it instead of a failure
      if (code === "ROLE_ALREADY_CLAIMED" && (await loadMe().then(onMe, () => false)) !== false) return;
      setProblem({ slug, text: code === "ROLE_HAS_VERIFICATION_HISTORY" ? t.errors.history : failure });
    } finally {
      setBusy(null);
      setAsking(null);
    }
  }

  if (me.roles.length === 0) {
    return (
      <section className={ideas.section} aria-labelledby="profile-roles">
        <h2 id="profile-roles" className={ideas.heading}>
          {t.heading}
        </h2>
        <div className={styles.none}>
          <p>{t.none}</p>
          <Link className={landing.ghost} href={`/${lang}/onboarding?step=role`}>
            {t.setUp}
          </Link>
        </div>
      </section>
    );
  }

  const nameOf = (role: MeRole) => ROLES.find((known) => known.slug === role.slug)?.name[lang] ?? role.name;
  // the main role first, then in the order of the list: the API's own order changes with every edit
  const ordered = [...me.roles].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || place(a) - place(b),
  );
  const free = ROLES.filter((role) => !me.roles.some((held) => held.slug === role.slug));
  // a failed add has no row to show its sentence on
  const addProblem = problem && !me.roles.some((role) => role.slug === problem.slug) ? problem : null;

  return (
    <section className={ideas.section} aria-labelledby="profile-roles">
      <h2 id="profile-roles" tabIndex={-1} className={`${ideas.heading} ${styles.heading}`}>
        {t.heading}
      </h2>
      <ul className={styles.rows}>
        {ordered.map((role) => {
          const { state, Icon, label } = verification(role);
          const underWay = state === "next";
          const titleId = `profile-role-${role.slug}`;
          return (
            <li key={role.slug} className={styles.row} data-arrived={arrived === role.slug || undefined}>
              <div className={styles.rowHead}>
                <h3 id={titleId} tabIndex={-1} className={styles.roleName}>
                  {nameOf(role)}
                </h3>
                <div className={styles.pills}>
                  {role.is_primary && (
                    <span className={village.pill} data-state="open">
                      <Flag />
                      {t.mainRole}
                    </span>
                  )}
                  <span className={village.pill} data-state={state}>
                    <Icon />
                    {t[label]}
                  </span>
                </div>
              </div>
              <div className={styles.rowActions}>
                {role.is_primary && state !== "done" && (
                  <Link className={landing.ghost} href={`/${lang}/verification`}>
                    {underWay ? t.seeWhere : t.verify}
                  </Link>
                )}
                {!role.is_primary && (
                  <>
                    <button
                      type="button"
                      className={landing.ghost}
                      aria-describedby={titleId}
                      aria-busy={busy === `main:${role.slug}` || undefined}
                      onClick={() => change(`main:${role.slug}`, role.slug, () => makeMainRole(role.slug), t.errors.change, titleId)}
                    >
                      {t.makeMain}
                    </button>
                    <button
                      type="button"
                      className={landing.ghost}
                      aria-describedby={titleId}
                      onClick={() => setAsking(role.slug)}
                    >
                      {t.remove}
                    </button>
                  </>
                )}
              </div>
              {problem?.slug === role.slug && (
                <p className={onboarding.error} role="alert">
                  <AlertCircle />
                  {problem.text}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {me.roles.length > 1 && <p className={styles.help}>{t.helper}</p>}

      {free.length > 0 && (
        <div className={styles.add}>
          <h3 id="profile-add-role" className={styles.addHeading}>
            {t.addHeading}
          </h3>
          <p className={styles.help}>{t.addHelp}</p>
          <div role="group" aria-labelledby="profile-add-role" className={onboarding.chips}>
            {free.map((role) => (
              <button
                key={role.slug}
                type="button"
                className={onboarding.chip}
                aria-busy={busy === `add:${role.slug}` || undefined}
                onClick={() =>
                  change(`add:${role.slug}`, role.slug, () => addRole(role.slug), t.errors.add, `profile-role-${role.slug}`)
                }
              >
                {role.name[lang]}
              </button>
            ))}
          </div>
          {addProblem && (
            <p className={onboarding.error} role="alert">
              <AlertCircle />
              {addProblem.text}
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={asking !== null}
        title={t.confirm.title}
        confirm={t.confirm.confirm}
        cancel={t.confirm.cancel}
        danger
        busy={busy?.startsWith("remove:")}
        onConfirm={() => asking && change(`remove:${asking}`, asking, () => removeRole(asking), t.errors.change, "profile-roles")}
        onCancel={() => setAsking(null)}
      >
        <p>{t.confirm.text}</p>
      </ConfirmDialog>
    </section>
  );
}
