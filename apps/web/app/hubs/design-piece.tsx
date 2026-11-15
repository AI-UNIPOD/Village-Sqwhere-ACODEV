"use client";

import { useEffect, useRef, useState } from "react";

import landing from "../landing/landing-page.module.css";
import { fill } from "../onboarding/copy";
import { X } from "../onboarding/icons";
import { Tooltip } from "../tooltip";
import { copy } from "./copy";
import { PieceForm, type Shared } from "./design-forms";
import type { Piece, PieceLink, Sketch } from "./hubs-api";
import styles from "./hubs.module.css";

// One piece: what it is, its links in words and, while the sketch can be changed, its buttons.
// A link has one delete button, on the line of the piece it starts from.
export function PieceCard(props: {
  shared: Shared;
  piece: Piece;
  sketch: Sketch;
  editable: boolean;
  onDeletePiece: (piece: Piece) => void;
  onDeleteLink: (link: PieceLink) => void;
}) {
  const { shared, piece, sketch, editable, onDeletePiece, onDeleteLink } = props;
  const d = copy[shared.lang].designSketch;
  const [editing, setEditing] = useState(false);
  const edit = useRef<HTMLButtonElement>(null);
  // after Cancel the form is gone, so the focus goes back to the button that opened it
  const cancelled = useRef(false);
  useEffect(() => {
    if (!editing && cancelled.current) {
      cancelled.current = false;
      edit.current?.focus();
    }
  }, [editing]);

  if (editing && editable) {
    return (
      <li className={styles.piece}>
        <PieceForm
          {...shared}
          piece={piece}
          onSaved={() => setEditing(false)}
          onCancel={() => {
            cancelled.current = true;
            setEditing(false);
          }}
        />
      </li>
    );
  }
  const named = (id: string) => sketch.pieces.find((one) => one.id === id)?.name ?? "";
  const out = sketch.links.filter((link) => link.from_piece_id === piece.id);
  const into = sketch.links.filter((link) => link.to_piece_id === piece.id);
  return (
    <li className={styles.piece}>
      <h3 className={styles.pieceName}>{piece.name}</h3>
      {piece.summary && <p className={styles.pieceSummary}>{piece.summary}</p>}
      {out.length > 0 && (
        <ul className={styles.pieceLinks}>
          {out.map((link) => {
            const label = fill(d.delete.linkLabel, { from: piece.name, to: named(link.to_piece_id) });
            return (
              <li key={link.id} className={styles.linkLine}>
                <span>{fill(d.to, { piece: named(link.to_piece_id), label: link.label })}</span>
                {editable && link.can_delete && (
                  <button type="button" className={styles.noteRemove} aria-label={label} onClick={() => onDeleteLink(link)}>
                    <X />
                    <Tooltip label={label} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {into.length > 0 && (
        <ul className={styles.pieceLinks}>
          {into.map((link) => (
            <li key={link.id}>{fill(d.from, { piece: named(link.from_piece_id), label: link.label })}</li>
          ))}
        </ul>
      )}
      {editable && (
        <div className={styles.phaseActions}>
          <button ref={edit} type="button" className={landing.ghost} aria-label={fill(d.piece.editLabel, { name: piece.name })} onClick={() => setEditing(true)}>
            {d.piece.edit}
          </button>
          {piece.can_delete && (
            <button type="button" className={landing.ghost} aria-label={fill(d.delete.pieceLabel, { name: piece.name })} onClick={() => onDeletePiece(piece)}>
              {d.delete.piece}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
