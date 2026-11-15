"use client";

import type { ReactNode } from "react";

import { when } from "../feed/post-parts";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import { fill } from "../onboarding/copy";
import { Check, CircleDashed } from "../onboarding/icons";
import { copy } from "./copy";
import { tickCheck, untickCheck, type Review, type ReviewCheck, type ReviewPiece } from "./hubs-api";
import styles from "./hubs.module.css";
import { buttonState, CheckForm, type Shared } from "./review-form";

type Props = { shared: Shared; piece: ReviewPiece; now: number };

const withCheck = (check: ReviewCheck) => (have: Review): Review => ({
  ...have,
  pieces: have.pieces.map((one) => ({ ...one, checks: one.checks.map((was) => (was.id === check.id ? check : was)) })),
});

// One check: its text, who added it, whether it is ticked and, from the API's flags, its buttons.
// The state is an icon and words, never a colour alone.
function CheckRow({ shared, piece, check, now, onDelete }: Props & { check: ReviewCheck; onDelete: (check: ReviewCheck) => void }) {
  const { lang, hubId, busy, send, change, refresh } = shared;
  const r = copy[lang].reviewTab;
  const label = (text: string) => fill(text, { text: check.text });
  const flip = (key: string, run: () => Promise<ReviewCheck>, text: string) =>
    send(piece.id, key, async () => {
      change(withCheck(await run()));
      // the other checks decide whether the hub can be finished, so the flags are read again
      await refresh();
      // the button that was pressed turns into the other one, so the line takes the focus
      return { text, focus: true };
    });
  const tick = `tick-${check.id}`;
  const untick = `untick-${check.id}`;
  const remove = `delete-${check.id}`;

  return (
    <li className={styles.check}>
      <p className={styles.checkText}>{check.text}</p>
      <p className={styles.checkMeta}>{fill(r.check.addedBy, { name: check.created_by.display_name })}</p>
      {check.ticked_by && check.ticked_at ? (
        <p className={styles.checkState} data-ticked="">
          <Check />
          {fill(r.check.ticked, { name: check.ticked_by.display_name, when: when(check.ticked_at, now, lang) })}
        </p>
      ) : (
        <p className={styles.checkState}>
          <CircleDashed />
          {r.check.notTicked}
        </p>
      )}
      {(check.can_tick || check.can_untick || check.can_delete) && (
        <div className={styles.phaseActions}>
          {check.can_tick && (
            <button
              type="button"
              className={landing.ghost}
              aria-label={label(r.check.tickLabel)}
              {...buttonState(busy, tick)}
              onClick={() => flip(tick, () => tickCheck(hubId, check.id), r.said.ticked)}
            >
              {r.check.tick}
            </button>
          )}
          {check.can_untick && (
            <button
              type="button"
              className={landing.ghost}
              aria-label={label(r.check.untickLabel)}
              {...buttonState(busy, untick)}
              onClick={() => flip(untick, () => untickCheck(hubId, check.id), r.said.unticked)}
            >
              {r.check.untick}
            </button>
          )}
          {check.can_delete && (
            <button
              type="button"
              className={landing.ghost}
              aria-label={label(r.check.deleteLabel)}
              {...buttonState(busy, remove)}
              onClick={() => !busy && onDelete(check)}
            >
              {r.check.delete}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// One piece: its name and summary, who built it, its checks and, when the viewer may add one, the
// field for it. `said` is the status line, shown under the checks.
export function ReviewPieceBlock(props: Props & { mine: boolean; canAdd: boolean; said: ReactNode; onDelete: (check: ReviewCheck) => void }) {
  const { shared, piece, now, mine, canAdd, said, onDelete } = props;
  const r = copy[shared.lang].reviewTab;
  const holder = piece.claimed_by;

  return (
    <li className={styles.piece}>
      <h3 className={styles.pieceName}>{piece.name}</h3>
      {piece.summary && <p className={styles.pieceSummary}>{piece.summary}</p>}
      <p className={styles.holder} data-free={!holder || undefined}>
        {!holder ? r.piece.nobody : mine ? r.piece.you : fill(r.piece.built, { name: holder.display_name })}
      </p>
      {mine && <p className={ideas.meta}>{r.piece.yours}</p>}
      {piece.checks.length === 0 ? (
        <p className={ideas.meta}>{r.piece.noChecks}</p>
      ) : (
        <ul className={styles.checks}>
          {piece.checks.map((check) => (
            <CheckRow key={check.id} shared={shared} piece={piece} check={check} now={now} onDelete={onDelete} />
          ))}
        </ul>
      )}
      {said}
      {canAdd && <CheckForm shared={shared} piece={piece} />}
    </li>
  );
}
