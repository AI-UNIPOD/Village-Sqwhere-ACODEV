"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, Clock, X } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { FieldError, LoadFailed } from "./form-parts";
import {
  declineInvitation,
  inviteMember,
  loadHub,
  loadMembers,
  withdrawInvitation,
  type Hub,
  type Member,
} from "./hubs-api";
import styles from "./hubs.module.css";

export const TEAM_MAX = 5;

type TeamCopy = (typeof copy)[Lang]["team"];
type Who = Pick<Member["user"], "username" | "display_name" | "is_verified">;

// A person, with their part in the hub once they have one.
export function Person({ lang, user, role }: { lang: Lang; user: Who; role?: string }) {
  const t = copy[lang];
  const named = user.display_name !== user.username;
  const github = (text: string) => (
    <a href={`https://github.com/${encodeURIComponent(user.username)}`} target="_blank" rel="noopener noreferrer">
      {text} <span className={landing.srOnly}>({t.githubProfile})</span>
    </a>
  );
  return (
    <div className={village.person}>
      <span className={village.avatar} aria-hidden="true">
        {(named ? user.display_name : user.username)
          .split(" ")
          .map((word) => word[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </span>
      <div>
        <p className={village.name}>{named ? user.display_name : github(user.username)}</p>
        {named && <p className={village.username}>{github(`@${user.username}`)}</p>}
        {(role || user.is_verified) && (
          <p className={ideas.meta}>
            {role}
            {user.is_verified && (
              <span className={styles.verified}>
                <Check />
                {t.verified}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// What an invitation's refusal means, or null when it is a failure to report.
export function inviteMessage(error: unknown, t: TeamCopy): string | null {
  if (!(error instanceof IdeaError)) return null;
  if (error.status === 422) return t.errors.invalid;
  if (error.code === "USER_NOT_FOUND") return t.errors.notFound;
  if (error.code === "ALREADY_MEMBER") return t.errors.alreadyMember;
  if (error.code === "ALREADY_INVITED") return t.errors.alreadyInvited;
  if (error.code === "HUB_ARCHIVED") return t.errors.archived;
  // the fifth place was taken after this page counted the team
  if (error.code === "TEAM_FULL") return t.full;
  return null;
}

function InviteForm({ lang, hubId, onInvited }: { lang: Lang; hubId: string; onInvited: (member: Member) => void }) {
  const t = copy[lang].team;
  const input = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setSentTo(null);
    // people paste "@ada-obi" from GitHub; the API wants the bare username
    const clean = username.trim().replace(/^@/, "");
    if (!clean) {
      setError(t.errors.invalid);
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const member = await inviteMember(hubId, clean);
      onInvited(member);
      setUsername("");
      setSentTo(member.user.display_name);
    } catch (failure) {
      if (failure instanceof SignedOutError) return;
      setError(inviteMessage(failure, t) ?? t.errors.failed);
    } finally {
      setBusy(false);
    }
    input.current?.focus();
  }

  return (
    <form noValidate onSubmit={send}>
      <div className={ideas.field}>
        <label htmlFor="invite-username" className={ideas.label}>
          {t.form.label}
        </label>
        <input
          ref={input}
          id="invite-username"
          className={onboarding.input}
          value={username}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!!error || undefined}
          aria-describedby={`invite-username-help${error ? " invite-username-error" : ""}`}
          onChange={(event) => setUsername(event.target.value)}
        />
        <p id="invite-username-help" className={ideas.help}>
          {t.form.help}
        </p>
        <FieldError id="invite-username">{error ?? undefined}</FieldError>
      </div>
      <button type="submit" className={`${landing.btn} ${styles.send}`} aria-busy={busy || undefined}>
        {t.form.send}
      </button>
      {sentTo && (
        <p className={ideas.done} role="status">
          <Check />
          {fill(t.form.sent, { name: sentTo })}
        </p>
      )}
    </form>
  );
}

// The people of a hub, for someone who is in it. The owner also sees the invitations and can
// send more.
export function Team({ lang, hub }: { lang: Lang; hub: Hub }) {
  const t = copy[lang];
  const isOwner = hub.viewer.member_role === "owner";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // the row the owner just added: only that one arrives with motion
  const [arrived, setArrived] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadMembers(hub.id).then(
      (found) => live && setMembers(found),
      (error: unknown) => {
        if (live && !(error instanceof SignedOutError)) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [hub.id, attempt]);

  function put(member: Member) {
    const same = (other: Member) => other.user.id === member.user.id;
    setMembers((list) => list && (list.some(same) ? list.map((other) => (same(other) ? member : other)) : [...list, member]));
    setArrived(member.user.id);
  }

  async function inviteAgain(member: Member) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      put(await inviteMember(hub.id, member.user.username));
    } catch (error) {
      if (!(error instanceof SignedOutError)) setProblem(inviteMessage(error, t.team) ?? t.team.actionFailed);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!withdrawing || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await withdrawInvitation(hub.id, withdrawing.user.id);
      setMembers((list) => list && list.filter((other) => other.user.id !== withdrawing.user.id));
    } catch (error) {
      if (error instanceof SignedOutError) return;
      // nothing pending any more (they signed, or it was withdrawn): show the list as it is now
      if (error instanceof IdeaError && error.code === "INVITATION_NOT_FOUND") setAttempt((n) => n + 1);
      else setProblem(t.team.actionFailed);
    } finally {
      setBusy(false);
      setWithdrawing(null);
    }
  }

  const active = members?.filter((member) => member.status === "active").length ?? hub.member_count;

  return (
    <div aria-busy={(!members && !failed) || undefined}>
      <p className={ideas.meta}>{fill(t.members, { n: active })}</p>
      {failed ? (
        <LoadFailed
          text={t.team.loadFailed}
          retry={t.retry}
          onRetry={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        />
      ) : !members ? (
        <div className={`${onboarding.skeleton} ${styles.pending}`} aria-hidden="true">
          <div className={onboarding.block} />
          <div className={onboarding.block} />
        </div>
      ) : (
        <ul className={styles.members}>
          {members.map((member) => (
            <li key={member.user.id} className={styles.member} data-arrived={member.user.id === arrived || undefined}>
              <Person
                lang={lang}
                user={member.user}
                // someone invited or who declined has no part in the hub yet
                role={member.status !== "active" ? undefined : member.member_role === "owner" ? t.owner : t.member}
              />
              {member.status !== "active" && (
                <div className={styles.side}>
                  {member.status === "invited" ? (
                    <span className={village.pill} data-state="open">
                      <Clock />
                      {t.team.invited}
                    </span>
                  ) : (
                    <span className={village.pill} data-state="later">
                      <X />
                      {t.team.declined}
                    </span>
                  )}
                  {isOwner && member.status === "invited" && (
                    <button
                      type="button"
                      className={landing.ghost}
                      aria-label={fill(t.team.named, { action: t.team.withdraw, name: member.user.display_name })}
                      onClick={() => setWithdrawing(member)}
                    >
                      {t.team.withdraw}
                    </button>
                  )}
                  {isOwner && member.status === "declined" && (
                    <button
                      type="button"
                      className={landing.ghost}
                      aria-label={fill(t.team.named, { action: t.team.inviteAgain, name: member.user.display_name })}
                      aria-busy={busy || undefined}
                      onClick={() => inviteAgain(member)}
                    >
                      {t.team.inviteAgain}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {problem && (
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {problem}
        </p>
      )}
      {isOwner &&
        members &&
        (active >= TEAM_MAX ? (
          <p className={styles.full}>{t.team.full}</p>
        ) : (
          <>
            <InviteForm lang={lang} hubId={hub.id} onInvited={put} />
            <p className={styles.line}>
              <Link href={`/${lang}/ideas/matches?id=${encodeURIComponent(hub.idea.id)}`}>{t.team.findMatches}</Link>
            </p>
          </>
        ))}
      <ConfirmDialog
        open={!!withdrawing}
        title={t.team.withdrawDialog.title}
        confirm={t.team.withdrawDialog.confirm}
        cancel={t.team.withdrawDialog.cancel}
        danger
        busy={busy}
        onConfirm={withdraw}
        onCancel={() => setWithdrawing(null)}
      >
        <p>{t.team.withdrawDialog.text}</p>
      </ConfirmDialog>
    </div>
  );
}

// What an invited developer sees in place of the team: read the agreement and sign, or decline.
export function InvitationCard({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang].invitation;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);

  async function decline() {
    if (busy) return;
    setBusy(true);
    setProblem(false);
    try {
      onChange(await declineInvitation(hub.id));
    } catch (error) {
      if (error instanceof SignedOutError) return;
      if (error instanceof IdeaError && (error.code === "INVITATION_NOT_FOUND" || error.code === "ALREADY_MEMBER")) {
        // the invitation changed under them: show the hub as it is now
        loadHub(hub.id).then(onChange, () => setProblem(true));
      } else setProblem(true);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <div className={styles.invitation}>
      <h2 className={styles.invitationTitle}>{t.title}</h2>
      <p className={styles.text}>{t.text}</p>
      {problem && (
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {t.failed}
        </p>
      )}
      <div className={styles.invitationActions}>
        <Link className={landing.btn} href={`/${lang}/hubs/join?id=${encodeURIComponent(hub.id)}`}>
          {t.sign}
        </Link>
        <button type="button" className={landing.ghost} onClick={() => setAsking(true)}>
          {t.decline}
        </button>
      </div>
      <ConfirmDialog
        open={asking}
        title={t.dialog.title}
        confirm={t.dialog.confirm}
        cancel={t.dialog.cancel}
        danger
        busy={busy}
        onConfirm={decline}
        onCancel={() => setAsking(false)}
      >
        <p>{t.dialog.text}</p>
      </ConfirmDialog>
    </div>
  );
}
