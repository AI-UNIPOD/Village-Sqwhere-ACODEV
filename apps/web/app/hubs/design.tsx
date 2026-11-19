"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { DEMO_READ_ONLY, NotSaved } from "../demo-refusal";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { copy } from "./copy";
import { codeOf, LinkForm, PieceForm, type Change, type Line, type Send, type Shared } from "./design-forms";
import { PieceCard } from "./design-piece";
import { layoutDesign } from "./design-layout";
import { LoadFailed } from "./form-parts";
import { deleteLink, deletePiece, loadHub, loadSketch, type Hub, type Piece, type PieceLink, type Sketch } from "./hubs-api";
import styles from "./hubs.module.css";

// The hub is not where this section needs it to be (still in brainstorm, team not confirmed) or
// the person is no longer in it: the hub is read again and the section follows it.
const CHANGED = ["PHASE_NOT_STARTED", "TEAM_NOT_CONFIRMED", "NOT_HUB_MEMBER"];
// The same for a change the API refused: the hub moved on while the person was typing.
const MOVED = [...CHANGED, "PHASE_CLOSED", "HUB_ARCHIVED"];

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
// While the hub is in design, members add, correct and delete pieces and links. There are no
// live updates: the sketch is read when the section shows and on Refresh.
export function DesignSketch({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang];
  const d = t.designSketch;
  const [sketch, setSketch] = useState<Sketch | null>(null);
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [line, setLine] = useState<(Line & { n: number }) | null>(null);
  // the key of the change on its way, shown on the button that started it
  const [busy, setBusy] = useState<string | null>(null);
  // the piece or the link the person is being asked about deleting
  const [piece, setPiece] = useState<Piece | null>(null);
  const [link, setLink] = useState<PieceLink | null>(null);
  const said = useRef<HTMLParagraphElement>(null);
  // the Try again button goes away once the sketch loads, so the line that says so takes the focus
  const moveFocus = useRef(false);
  const wide = useWide();

  // a new object each time, so the same sentence twice is still announced
  const say = useCallback((found: Line) => setLine((have) => ({ ...found, n: (have?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (line?.focus) said.current?.focus();
  }, [line]);

  useEffect(() => {
    let live = true;
    loadSketch(hub.id).then(
      (found) => {
        if (!live) return;
        setSketch(found);
        setFailed(false);
        setRefreshing(false);
        if (attempt > 0) say({ text: d.refreshed, focus: moveFocus.current });
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
  }, [hub.id, attempt, onChange, say, d]);

  function reload(focus: boolean) {
    // a sketch read while a change is on its way could miss the change or hold it twice
    if (refreshing || busy) return;
    moveFocus.current = focus;
    setRefreshing(true);
    setLine(null);
    setAttempt((count) => count + 1);
  }

  const change: Change = (apply) => setSketch((have) => have && apply(have));
  const reloadSketch = () => loadSketch(hub.id).then(setSketch, () => {});

  // The sentence for a refused or failed change, or null for a signed-out person, who is being sent to sign-in.
  function refused(reason: unknown): Line | null {
    if (reason instanceof SignedOutError) return null;
    const code = codeOf(reason);
    // the demo can never save it, so "try again" would be wrong
    if (code === DEMO_READ_ONLY) return { text: "", demo: true };
    if (MOVED.includes(code)) {
      // show the hub as it is now, so the section fits it; the line already says what happened
      loadHub(hub.id).then(onChange, () => {});
      return { text: d.errors.moved, problem: true, focus: true };
    }
    if (code === "PIECE_NOT_FOUND" || code === "LINK_NOT_FOUND") {
      reloadSketch();
      return { text: d.errors.changed, problem: true, focus: true };
    }
    if (code === "PIECES_FULL") return { text: d.errors.piecesFull, problem: true };
    if (code === "LINKS_FULL") return { text: d.errors.linksFull, problem: true };
    if (code === "NOT_PIECE_AUTHOR" || code === "NOT_LINK_AUTHOR") return { text: d.errors.notAuthor, problem: true };
    return { text: d.errors.failed, problem: true };
  }

  const send: Send = async (key, run) => {
    if (busy || refreshing) return;
    setBusy(key);
    setLine(null);
    try {
      const found = await run();
      if (found) say(found);
    } catch (reason) {
      const found = refused(reason);
      if (found) say(found);
    } finally {
      setBusy(null);
    }
  };

  async function removePiece() {
    const gone = piece;
    if (!gone || busy || refreshing) return;
    await send("delete", async () => {
      await deletePiece(hub.id, gone.id);
      change((have) => ({
        pieces: have.pieces.filter((one) => one.id !== gone.id),
        links: have.links.filter((one) => one.from_piece_id !== gone.id && one.to_piece_id !== gone.id),
      }));
      // its links went with it, and others may have changed the sketch meanwhile
      reloadSketch();
      return { text: d.delete.pieceDone, focus: true };
    });
    setPiece(null);
  }

  async function removeLink() {
    const gone = link;
    if (!gone || busy || refreshing) return;
    await send("delete", async () => {
      await deleteLink(hub.id, gone.id);
      change((have) => ({ ...have, links: have.links.filter((one) => one.id !== gone.id) }));
      return { text: d.delete.linkDone, focus: true };
    });
    setLink(null);
  }

  if (moved) return null;

  const inDesign = hub.phase === "design";
  const editable = inDesign && hub.status === "active";
  const lead = hub.status === "archived" ? d.archived : inDesign ? d.intro : d.over;
  const shared: Shared = { lang, hubId: hub.id, busy, refreshing, send, change };

  return (
    <section id="design" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{d.heading}</h2>
      <p className={ideas.lead}>{lead}</p>
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
                {sketch.pieces.map((one) => (
                  <PieceCard
                    key={one.id}
                    shared={shared}
                    piece={one}
                    sketch={sketch}
                    editable={editable}
                    onDeletePiece={setPiece}
                    onDeleteLink={setLink}
                  />
                ))}
              </ul>
            </>
          )}
          <div className={styles.phaseActions}>
            <button
              type="button"
              className={landing.ghost}
              aria-busy={refreshing || undefined}
              aria-disabled={!!busy || undefined}
              onClick={() => reload(false)}
            >
              {d.refresh}
            </button>
          </div>
        </>
      )}
      {line &&
        (line.demo ? (
          <NotSaved key={line.n} lang={lang} spaced />
        ) : line.problem ? (
          <p key={line.n} ref={said} tabIndex={-1} className={`${onboarding.error} ${styles.problem}`} role="alert">
            <AlertCircle />
            {line.text}
          </p>
        ) : (
          <p key={line.n} ref={said} tabIndex={-1} className={ideas.done} role="status">
            <Check />
            {line.text}
          </p>
        ))}
      {editable && sketch && (
        <>
          <PieceForm {...shared} />
          {sketch.pieces.length >= 2 && <LinkForm {...shared} pieces={sketch.pieces} />}
        </>
      )}
      <ConfirmDialog
        open={!!piece}
        title={d.delete.pieceTitle}
        confirm={d.delete.pieceConfirm}
        cancel={d.delete.cancel}
        danger
        busy={busy === "delete"}
        onConfirm={removePiece}
        onCancel={() => setPiece(null)}
      >
        <p>{d.delete.pieceText}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={!!link}
        title={d.delete.linkTitle}
        confirm={d.delete.linkConfirm}
        cancel={d.delete.cancel}
        danger
        busy={busy === "delete"}
        onConfirm={removeLink}
        onCancel={() => setLink(null)}
      >
        <p>{d.delete.linkText}</p>
      </ConfirmDialog>
    </section>
  );
}
