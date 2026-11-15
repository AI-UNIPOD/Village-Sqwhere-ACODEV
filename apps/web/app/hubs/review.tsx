"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { useMe } from "../session/me";
import { copy } from "./copy";
import { codeOf, type Line } from "./design-forms";
import { LoadFailed } from "./form-parts";
import { deleteCheck, finishHub, loadHub, loadReview, type Hub, type Review, type ReviewCheck } from "./hubs-api";
import styles from "./hubs.module.css";
import { buttonState, type Send, type Shared } from "./review-form";
import { ReviewPieceBlock } from "./review-piece";

// The hub is not where this section needs it to be, or the person is no longer in it, or it is
// finished or archived: the hub is read again and the section follows it.
const MOVED = ["HUB_FINISHED", "PHASE_NOT_STARTED", "TEAM_NOT_CONFIRMED", "HUB_ARCHIVED", "NOT_HUB_MEMBER"];
// The checklist is not as the page shows it: it is read again.
const CHANGED = ["CHECK_TICKED", "CHECK_NOT_TICKED", "CHECK_NOT_FOUND", "PIECE_NOT_FOUND"];
// Refused, and the checklist is as it was: the sentence is all there is to say.
const SENTENCES = { OWN_PIECE: "own", CHECK_LIMIT: "limit", NOT_CHECK_TICKER: "notTicker", NOT_CHECK_AUTHOR: "notAuthor", NOT_HUB_OWNER: "notOwner" } as const;

// The hub's review checklist, for its active members once the hub has reached review: the checks
// the team wrote against each piece, which a teammate ticks, and the owner finishing the hub. There
// are no live updates: the checklist is read when the section shows and after each change, so the
// buttons that depend on other checks (Finish the hub) stay true.
export function ReviewTab({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang];
  const r = t.reviewTab;
  const me = useMe();
  const [review, setReview] = useState<Review | null>(null);
  // read again with each answer, so every date counts from the same moment
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [line, setLine] = useState<(Line & { n: number; area: string }) | null>(null);
  // the key of the change on its way, shown on the button that started it
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ check: ReviewCheck; area: string } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const said = useRef<HTMLParagraphElement>(null);

  // a new object each time, so the same sentence twice is still announced
  const say = useCallback((found: Line, area: string) => setLine((have) => ({ ...found, area, n: (have?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (line?.focus) said.current?.focus();
  }, [line]);

  const apply = useCallback((answer: Review) => {
    setReview(answer);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    let live = true;
    loadReview(hub.id).then(
      (found) => {
        if (!live) return;
        apply(found);
        setFailed(false);
        // the Try again button goes away once the checklist loads, so the line that says so takes the focus
        if (attempt > 0) say({ text: r.reloaded, focus: true }, "hub");
      },
      (reason: unknown) => {
        if (!live || reason instanceof SignedOutError) return;
        if (MOVED.includes(codeOf(reason))) {
          // show the hub as it is now, so the page fits it; nothing more to say here
          setMoved(true);
          loadHub(hub.id).then(onChange, () => {});
          return;
        }
        setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  // the flags belong to the phase and the status they were read in, so a hub that moves on while the
  // section is shown reads it again
  }, [hub.id, hub.phase, hub.status, attempt, onChange, apply, say, r]);

  const refresh = useCallback(() => loadReview(hub.id).then(apply, () => {}), [hub.id, apply]);

  // The sentence for a refused or failed change, or null when the frame already says why.
  function refused(reason: unknown): Line | null {
    if (reason instanceof SignedOutError) return null;
    const code = codeOf(reason);
    // in the demo the frame says why; "try again" would be wrong
    if (code === "DEMO_READ_ONLY") return null;
    if (MOVED.includes(code)) {
      // show the hub and the checklist as they are now, so the section and its buttons fit them; the
      // line already says what happened
      loadHub(hub.id).then(onChange, () => {});
      void refresh();
      return { text: r.errors.moved, problem: true, focus: true };
    }
    if (CHANGED.includes(code)) {
      void refresh();
      return { text: r.errors.changed, problem: true, focus: true };
    }
    if (code === "CHECKS_OPEN") {
      void refresh();
      return { text: r.errors.open, problem: true, focus: true };
    }
    const sentence = SENTENCES[code as keyof typeof SENTENCES];
    return { text: sentence ? r.errors[sentence] : r.errors.failed, problem: true };
  }

  // One change at a time: a checklist read while a change is on its way could miss the change.
  const send: Send = async (area, key, run) => {
    if (busy) return;
    setBusy(key);
    setLine(null);
    try {
      const found = await run();
      if (found) say(found, area);
    } catch (reason) {
      const found = refused(reason);
      if (found) say(found, area);
    } finally {
      setBusy(null);
    }
  };

  // The dialogs close first: the button that was pressed is gone once the change is made, and the
  // line that says so takes the focus, which a modal dialog would not let it.
  function remove() {
    const gone = deleting;
    setDeleting(null);
    if (!gone) return;
    void send(gone.area, `delete-${gone.check.id}`, async () => {
      await deleteCheck(hub.id, gone.check.id);
      setReview((have) => have && { ...have, pieces: have.pieces.map((one) => ({ ...one, checks: one.checks.filter((was) => was.id !== gone.check.id) })) });
      await refresh();
      return { text: r.said.deleted, focus: true };
    });
  }

  function finish() {
    setFinishing(false);
    void send("hub", "finish", async () => {
      onChange(await finishHub(hub.id));
      await refresh();
      return { text: r.said.finished, focus: true };
    });
  }

  if (moved) return null;

  const finishedAt = review?.finished_at ?? hub.finished_at;
  const lead = finishedAt
    ? fill(r.finished, { date: new Date(finishedAt).toLocaleDateString(lang, { dateStyle: "long" }) })
    : hub.status === "archived"
      ? r.archived
      : r.intro;
  const shared: Shared = { lang, hubId: hub.id, busy, send, change: (apply) => setReview((have) => have && apply(have)), refresh };

  // the line of an area: a sentence that says what happened, or a problem. One about a piece that is
  // gone from the checklist is said with the checklist as a whole.
  const home = line && review?.pieces.some((one) => one.id === line.area) ? line.area : "hub";
  const says = (area: string) =>
    line &&
    home === area &&
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
    ));

  const checks = review?.pieces.flatMap((piece) => piece.checks) ?? [];
  const ticked = checks.filter((check) => check.ticked_by).length;
  const owner = hub.viewer.member_role === "owner";

  return (
    <section id="review" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{r.heading}</h2>
      <p className={ideas.lead}>{lead}</p>
      {failed && <LoadFailed text={r.loadFailed} retry={t.retry} onRetry={() => setAttempt((count) => count + 1)} />}
      {review === null || me === null ? (
        !failed && (
          <div aria-busy="true">
            <p className={landing.srOnly} role="status">
              {r.loading}
            </p>
            <div className={`${onboarding.skeleton} ${styles.pending}`} aria-hidden="true">
              <div className={onboarding.block} />
              <div className={onboarding.block} />
            </div>
          </div>
        )
      ) : (
        <>
          <p className={`${ideas.meta} ${styles.line}`}>
            {review.pieces.length === 0
              ? r.noPieces
              : checks.length === 0
                ? r.noChecks
                : fill(new Intl.PluralRules(lang).select(checks.length) === "one" ? r.countOne : r.count, { n: ticked, total: checks.length })}
          </p>
          {review.can_finish && (
            <div className={styles.phaseActions}>
              <button type="button" className={landing.ghost} {...buttonState(busy, "finish")} onClick={() => !busy && setFinishing(true)}>
                {r.finish.button}
              </button>
            </div>
          )}
          {owner && review.can_add && !review.can_finish && <p className={`${ideas.meta} ${styles.line}`}>{r.finish.open}</p>}
          {says("hub")}
          <ul className={styles.reviewPieces}>
            {review.pieces.map((piece) => (
              <ReviewPieceBlock
                key={piece.id}
                shared={shared}
                piece={piece}
                now={now}
                mine={piece.claimed_by?.username === me.username}
                canAdd={review.can_add}
                said={says(piece.id)}
                onDelete={(check) => setDeleting({ check, area: piece.id })}
              />
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={finishing}
        title={r.finish.title}
        confirm={r.finish.confirm}
        cancel={r.cancel}
        onConfirm={finish}
        onCancel={() => setFinishing(false)}
      >
        <p>{r.finish.text}</p>
      </ConfirmDialog>
      <ConfirmDialog open={!!deleting} title={r.delete.title} confirm={r.delete.confirm} cancel={r.cancel} danger onConfirm={remove} onCancel={() => setDeleting(null)}>
        <p>{r.delete.text}</p>
      </ConfirmDialog>
    </section>
  );
}
