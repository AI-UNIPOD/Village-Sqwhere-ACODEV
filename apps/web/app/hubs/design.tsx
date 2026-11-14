"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { layoutDesign } from "./design-layout";
import { LoadFailed } from "./form-parts";
import { loadHub, loadSketch, type Hub, type Piece, type Sketch } from "./hubs-api";
import styles from "./hubs.module.css";

// The hub is not where this section needs it to be (still in brainstorm, team not confirmed) or
// the person is no longer in it: the hub is read again and the section follows it.
const CHANGED = ["PHASE_NOT_STARTED", "TEAM_NOT_CONFIRMED", "NOT_HUB_MEMBER"];

// The drawing is an extra for a screen with room for it. The list holds everything at any width.
const WIDE = "(min-width: 768px)";
const watchWidth = (notify: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const useWide = () =>
  useSyncExternalStore(
    watchWidth,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

// Boxes and arrows as one picture, hidden from assistive technology: the list says all of it.
function Drawing({ sketch }: { sketch: Sketch }) {
  const { width, height, boxes, arrows } = useMemo(() => layoutDesign(sketch.pieces, sketch.links), [sketch]);
  return (
    <div className={styles.figure}>
      <svg className={styles.drawing} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
        {arrows.map((arrow) => (
          <path key={arrow.id} className={styles.arrow} d={arrow.d} />
        ))}
        {boxes.map((box) => (
          <g key={box.id}>
            <rect className={styles.box} x={box.x} y={box.y} width={box.w} height={box.h} />
            {box.lines.map((line, i) => (
              <text key={i} className={styles.boxName} x={box.x + box.w / 2} y={line.y}>
                {line.text}
              </text>
            ))}
          </g>
        ))}
        {arrows.map(({ id, label }) => (
          <rect key={id} className={styles.labelPatch} x={label.patch.x} y={label.patch.y} width={label.patch.w} height={label.patch.h} />
        ))}
        {arrows.map(({ id, label }) =>
          label.lines.map((line, i) => (
            <text key={`${id}-${i}`} className={styles.arrowLabel} x={label.x} y={line.y}>
              {line.text}
            </text>
          )),
        )}
      </svg>
    </div>
  );
}

// The hub's design sketch, for its active members once the hub has reached design: the pieces
// of the system and the labelled links between them, as a list and, on a wide screen, drawn.
// Reading only. There are no live updates: the sketch is read when the section shows and on Refresh.
export function DesignSketch({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang];
  const d = t.designSketch;
  const [sketch, setSketch] = useState<Sketch | null>(null);
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const said = useRef<HTMLParagraphElement>(null);
  // the Try again button goes away once the sketch loads, so the line that says so takes the focus
  const moveFocus = useRef(false);
  const wide = useWide();

  useEffect(() => {
    if (refreshed && moveFocus.current) said.current?.focus();
  }, [refreshed]);

  useEffect(() => {
    let live = true;
    loadSketch(hub.id).then(
      (found) => {
        if (!live) return;
        setSketch(found);
        setFailed(false);
        setRefreshing(false);
        if (attempt > 0) setRefreshed(true);
      },
      (reason: unknown) => {
        if (!live || reason instanceof SignedOutError) return;
        if (reason instanceof IdeaError && CHANGED.includes(reason.code)) {
          // show the hub as it is now, so the page fits it; nothing more to say here
          setMoved(true);
          loadHub(hub.id).then(onChange, () => {});
          return;
        }
        setFailed(true);
        setRefreshing(false);
      },
    );
    return () => {
      live = false;
    };
  }, [hub.id, attempt, onChange]);

  function reload(focus: boolean) {
    if (refreshing) return;
    moveFocus.current = focus;
    setRefreshing(true);
    setRefreshed(false);
    setAttempt((count) => count + 1);
  }

  if (moved) return null;

  const inDesign = hub.phase === "design";
  const line = hub.status === "archived" ? d.archived : inDesign ? d.intro : d.over;
  const named = (id: string) => sketch?.pieces.find((piece) => piece.id === id)?.name ?? "";
  const links = (piece: Piece, key: "from_piece_id" | "to_piece_id") => sketch?.links.filter((link) => link[key] === piece.id) ?? [];

  return (
    <section id="design" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{d.heading}</h2>
      <p className={ideas.lead}>{line}</p>
      {failed && <LoadFailed text={d.loadFailed} retry={t.retry} onRetry={() => reload(true)} />}
      {sketch === null ? (
        !failed && (
          <div aria-busy="true">
            <p className={landing.srOnly} role="status">
              {d.loading}
            </p>
            <div className={`${onboarding.skeleton} ${styles.pending}`} aria-hidden="true">
              <div className={onboarding.block} />
              <div className={onboarding.block} />
            </div>
          </div>
        )
      ) : (
        <>
          {sketch.pieces.length === 0 ? (
            <p className={`${ideas.meta} ${styles.line}`}>{inDesign ? d.empty : d.emptyAfter}</p>
          ) : (
            <>
              {wide && <Drawing sketch={sketch} />}
              <ul className={styles.pieces}>
                {sketch.pieces.map((piece) => {
                  const out = links(piece, "from_piece_id");
                  const into = links(piece, "to_piece_id");
                  return (
                    <li key={piece.id} className={styles.piece}>
                      <h3 className={styles.pieceName}>{piece.name}</h3>
                      {piece.summary && <p className={styles.pieceSummary}>{piece.summary}</p>}
                      {out.length > 0 && (
                        <ul className={styles.pieceLinks}>
                          {out.map((link) => (
                            <li key={link.id}>{fill(d.to, { piece: named(link.to_piece_id), label: link.label })}</li>
                          ))}
                        </ul>
                      )}
                      {into.length > 0 && (
                        <ul className={styles.pieceLinks}>
                          {into.map((link) => (
                            <li key={link.id}>{fill(d.from, { piece: named(link.from_piece_id), label: link.label })}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className={styles.phaseActions}>
            <button type="button" className={landing.ghost} aria-busy={refreshing || undefined} onClick={() => reload(false)}>
              {d.refresh}
            </button>
          </div>
        </>
      )}
      {refreshed && (
        <p ref={said} tabIndex={-1} className={ideas.done} role="status">
          <Check />
          {d.refreshed}
        </p>
      )}
    </section>
  );
}
