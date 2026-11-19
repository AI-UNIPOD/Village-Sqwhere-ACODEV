"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check, Clock, Users, X } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { FieldError, LoadFailed } from "./form-parts";
import {
  approveRequest,
  declineInvitation,
  declineRequest,
  inviteMember,
  leaveHub,
  loadHub,
  loadMembers,
  removeMember,
  withdrawInvitation,
  type Hub,
  type Member,
} from "./hubs-api";
import styles from "./hubs.module.css";
import { forgetInvitation } from "./invitations";

export const TEAM_MAX = 5;

// How a person who is not an active member is marked. A request waits on the owner, so it is the
// one that stands out.
const PILLS = {
  requested: { state: "next", Icon: Users },
  invited: { state: "open", Icon: Clock },
  declined: { state: "later", Icon: X },
} as const;

function Pill({ status, label }: { status: keyof typeof PILLS; label: string }) {
  const { state, Icon } = PILLS[status];
  return (
    <span className={village.pill} data-state={state}>
      <Icon />
      {label}
    </span>
  );
}

type TeamCopy = (typeof copy)[Lang]["team"];
type Who = Pick<Member["user"], "username" | "display_name" | "is_verified">;

// A person, with their part in the hub once they have one.
export function Person({ lang, user, role }: { lang: Lang; user: Who; role?: string }) {
  const t = copy[lang];
  const named = user.display_name !== user.username;
  const profile = (text: string) => <Link href={`/${lang}/people/view?username=${encodeURIComponent(user.username)}`}>{text}</Link>;
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
        <p className={village.name}>{named ? profile(user.display_name) : profile(user.username)}</p>
        {named && <p className={village.username}>@{user.username}</p>}
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
  const [declining, setDeclining] = useState<Member | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // what the owner's last answer did, for a screen reader
  const [notice, setNotice] = useState<string | null>(null);

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

  // approving or declining a request: the API answers with the person's new place, which replaces the row
  async function answer(member: Member, approve: boolean) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      put(await (approve ? approveRequest : declineRequest)(hub.id, member.user.id));
      setNotice(fill(approve ? t.team.approved : t.team.requestDeclined, { name: member.user.display_name }));
    } catch (error) {
      if (error instanceof SignedOutError) return;
      if (error instanceof IdeaError && error.code === "REQUEST_NOT_FOUND") {
        // the person withdrew nothing, but the request is gone (answered elsewhere): show the list as it is now
        setAttempt((n) => n + 1);
        setProblem(t.team.requestGone);
      } else setProblem((approve ? inviteMessage(error, t.team) : null) ?? t.team.actionFailed);
    } finally {
      setBusy(false);
      setDeclining(null);
    }
  }

  async function inviteAgain(member: Member) {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setNotice(null);
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
    setNotice(null);
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

  async function remove() {
    if (!removing || busy) return;
    const gone = removing;
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await removeMember(hub.id, gone.user.id);
      setMembers((list) => list && list.filter((other) => other.user.id !== gone.user.id));
      setNotice(fill(t.team.removed, { name: gone.user.display_name }));
    } catch (error) {
      if (error instanceof SignedOutError) return;
      const code = error instanceof IdeaError ? error.code : "";
      if (code === "MEMBER_NOT_FOUND") {
        // they left, or were removed in another tab: show the list as it is now
        setAttempt((n) => n + 1);
        setNotice(fill(t.team.removeGone, { name: gone.user.display_name }));
      } else setProblem(code === "HUB_ARCHIVED" ? t.team.errors.archived : t.team.actionFailed);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  }

  // an archived hub's team cannot change, and the owner is never removed
  const manages = isOwner && hub.status === "active";
  const removable = (member: Member) => manages && member.status === "active" && member.member_role !== "owner";
  const active = members?.filter((member) => member.status === "active").length ?? hub.member_count;
  // requests wait on the owner, so they come first
  const shown = [...(members ?? [])].sort((a, b) => Number(b.status === "requested") - Number(a.status === "requested"));

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
          {shown.map((member) => (
            <li key={member.user.id} className={styles.member} data-arrived={member.user.id === arrived || undefined}>
              <Person
                lang={lang}
                user={member.user}
                // someone invited or who declined has no part in the hub yet
                role={member.status !== "active" ? undefined : member.member_role === "owner" ? t.owner : t.member}
              />
              {removable(member) && (
                <div className={styles.side}>
                  <button
                    type="button"
                    className={landing.ghost}
                    aria-label={fill(t.team.named, { action: t.team.remove, name: member.user.display_name })}
                    onClick={() => setRemoving(member)}
                  >
                    {t.team.remove}
                  </button>
                </div>
              )}
              {member.status !== "active" && (
                <div className={styles.side}>
                  <Pill status={member.status} label={t.team[member.status]} />
                  {manages && member.status === "requested" && (
                    <>
                      <button
                        type="button"
                        className={landing.ghost}
                        aria-label={fill(t.team.named, { action: t.team.approve, name: member.user.display_name })}
                        aria-busy={busy || undefined}
                        onClick={() => answer(member, true)}
                      >
                        {t.team.approve}
                      </button>
                      <button
                        type="button"
                        className={landing.ghost}
                        aria-label={fill(t.team.named, { action: t.team.decline, name: member.user.display_name })}
                        onClick={() => setDeclining(member)}
                      >
                        {t.team.decline}
                      </button>
                    </>
                  )}
                  {manages && member.status === "invited" && (
                    <button
                      type="button"
                      className={landing.ghost}
                      aria-label={fill(t.team.named, { action: t.team.withdraw, name: member.user.display_name })}
                      onClick={() => setWithdrawing(member)}
                    >
                      {t.team.withdraw}
                    </button>
                  )}
                  {manages && member.status === "declined" && (
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
      {notice && (
        <p className={ideas.done} role="status">
          <Check />
          {notice}
        </p>
      )}
      {problem && (
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {problem}
        </p>
      )}
      {manages &&
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
        open={!!declining}
        title={t.team.declineDialog.title}
        confirm={t.team.declineDialog.confirm}
        cancel={t.team.declineDialog.cancel}
        danger
        busy={busy}
        onConfirm={() => declining && answer(declining, false)}
        onCancel={() => setDeclining(null)}
      >
        <p>{t.team.declineDialog.text}</p>
      </ConfirmDialog>
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
      <ConfirmDialog
        open={!!removing}
        title={t.team.removeDialog.title}
        confirm={t.team.removeDialog.confirm}
        cancel={t.team.removeDialog.cancel}
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        <p>{t.team.removeDialog.text}</p>
      </ConfirmDialog>
    </div>
  );
}

// For an active member who is not the owner: leave the hub, behind a confirmation. The API
// answers with the hub card, so the page shows the hub as someone who left it.
export function LeaveHub({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang].leave;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);

  async function leave() {
    if (busy) return;
    setBusy(true);
    setProblem(false);
    try {
      onChange(await leaveHub(hub.id));
    } catch (error) {
      if (error instanceof SignedOutError) return;
      // no longer an active member (removed or left in another tab): show the hub as it is now
      if (error instanceof IdeaError && error.code === "MEMBERSHIP_NOT_FOUND") loadHub(hub.id).then(onChange, () => setProblem(true));
      else setProblem(true);
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  return (
    <div className={styles.line}>
      {problem && (
        <p className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {t.failed}
        </p>
      )}
      <button type="button" className={landing.ghost} onClick={() => setAsking(true)}>
        {t.button}
      </button>
      <ConfirmDialog open={asking} title={t.title} confirm={t.confirm} cancel={t.cancel} danger busy={busy} onConfirm={leave} onCancel={() => setAsking(false)}>
        <p>{t.text}</p>
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
      forgetInvitation(hub.id);
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
