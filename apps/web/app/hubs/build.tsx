"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { DEMO_READ_ONLY, notSaved } from "../demo-refusal";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import { useMe } from "../session/me";
import { Commits } from "./build-commits";
import { Repository } from "./build-repository";
import type { Send } from "./build-parts";
import { copy } from "./copy";
import { codeOf, type Line } from "./design-forms";
import { LoadFailed } from "./form-parts";
import { claimPiece, loadBuild, loadHub, releasePiece, type Build, type BuildPiece, type Hub } from "./hubs-api";
import styles from "./hubs.module.css";

// The hub is not where this section needs it to be, or the person is no longer in it, or the
// build phase is over: the hub is read again and the section follows it.
const MOVED = ["PHASE_CLOSED", "PHASE_NOT_STARTED", "TEAM_NOT_CONFIRMED", "HUB_ARCHIVED", "NOT_HUB_MEMBER"];

// The line says where it shows: under the pieces, the repository or the commits.
type Area = "pieces" | "repository" | "commits";

// The hub's build tab, for its active members once the hub has reached build: who builds which
// piece of the sketch, the team's repository and its latest commits. There are no live updates:
// the tab is read when the section shows, and "Refresh commits" reads it again with the commits.
export function BuildTab({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang];
  const b = t.buildTab;
  const me = useMe();
  const [build, setBuild] = useState<Build | null>(null);
  // read again with each answer, so every date counts from the same moment
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [moved, setMoved] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [line, setLine] = useState<(Line & { n: number; area: Area }) | null>(null);
  // the key of the change on its way, shown on the button that started it
  const [busy, setBusy] = useState<string | null>(null);
  const said = useRef<HTMLParagraphElement>(null);

  // a new object each time, so the same sentence twice is still announced
  const say = useCallback((found: Line, area: Area) => setLine((have) => ({ ...found, area, n: (have?.n ?? 0) + 1 })), []);

  useEffect(() => {
    if (line?.focus) said.current?.focus();
  }, [line]);

  const apply = useCallback((answer: Build) => {
    setBuild(answer);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    let live = true;
    loadBuild(hub.id).then(
      (found) => {
        if (!live) return;
        apply(found);
        setFailed(false);
        // the Try again button goes away once the tab loads, so the line that says so takes the focus
        if (attempt > 0) say({ text: b.reloaded, focus: true }, "pieces");
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
  // the flags belong to the phase and the status they were read in, so a hub that moves on while the tab
  // is shown reads it again
  }, [hub.id, hub.phase, hub.status, attempt, onChange, apply, say, b]);

  const reloadBuild = () => loadBuild(hub.id).then(apply, () => {});

  // The sentence for a refused or failed change, or null for a signed-out person, who is being sent to sign-in.
  function refused(reason: unknown): Line | null {
    if (reason instanceof SignedOutError) return null;
    const code = codeOf(reason);
    // the demo can never save it, so "try again" would be wrong
    if (code === DEMO_READ_ONLY) return { text: notSaved(lang), problem: true };
    if (MOVED.includes(code)) {
      // show the hub and the tab as they are now, so the section and its buttons fit them; the line
      // already says what happened
      loadHub(hub.id).then(onChange, () => {});
      reloadBuild();
      return { text: b.errors.moved, problem: true, focus: true };
    }
    if (code === "PIECE_CLAIMED") {
      reloadBuild();
      return { text: b.errors.claimed, problem: true, focus: true };
    }
    if (code === "PIECE_NOT_FOUND") {
      reloadBuild();
      return { text: b.errors.changed, problem: true, focus: true };
    }
    if (code === "REPOSITORY_NOT_SET" || code === "REPOSITORY_CHANGED") {
      reloadBuild();
      return { text: b.errors.repositoryChanged, problem: true, focus: true };
    }
    if (code === "NOT_PIECE_HOLDER") {
      reloadBuild();
      return { text: b.errors.notHolder, problem: true, focus: true };
    }
    if (code === "NOT_HUB_OWNER") return { text: b.errors.notOwner, problem: true };
    if (code === "REFRESH_TOO_SOON") return { text: b.errors.tooSoon, problem: true };
    if (code === "REPOSITORY_UNAVAILABLE") return { text: b.errors.unavailable, problem: true };
    return { text: b.errors.failed, problem: true };
  }

  // One change at a time: a tab read while a change is on its way could miss the change.
  async function send(area: Area, key: string, run: () => Promise<Line | null>) {
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
  }

  const replace = (piece: BuildPiece) => setBuild((have) => have && { ...have, pieces: have.pieces.map((one) => (one.id === piece.id ? piece : one)) });
  const sendIn = (area: Area): Send => (key, run) => send(area, key, run);
  const shared = { lang, hubId: hub.id, busy, apply };

  // the line of an area: a sentence that says what happened, or a problem
  const says = (area: Area) =>
    line?.area === area &&
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

  if (moved) return null;

  const lead = hub.status === "archived" ? b.archived : hub.phase === "review" ? b.over : b.intro;
  // a demo's repository does not exist on GitHub, and a profile still loading is not known to be one
  const linkable = !!me && !me.is_demo;

  return (
    <section id="build" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{b.heading}</h2>
      <p className={ideas.lead}>{lead}</p>
      {failed && <LoadFailed text={b.loadFailed} retry={t.retry} onRetry={() => setAttempt((count) => count + 1)} />}
      {build === null || me === null ? (
        !failed && (
          <div aria-busy="true">
            <p className={landing.srOnly} role="status">
              {b.loading}
            </p>
            <div className={`${onboarding.skeleton} ${styles.pending}`} aria-hidden="true">
              <div className={onboarding.block} />
              <div className={onboarding.block} />
            </div>
          </div>
        )
      ) : (
        <>
          <section aria-labelledby="build-pieces" className={styles.buildPart}>
            <h3 id="build-pieces" className={styles.formTitle}>
              {b.pieces.heading}
            </h3>
            {build.pieces.length === 0 ? (
              <p className={`${ideas.meta} ${styles.line}`}>{b.pieces.empty}</p>
            ) : (
              <ul className={styles.pieces}>
                {build.pieces.map((piece) => {
                  const key = `piece-${piece.id}`;
                  const holder = piece.claimed_by;
                  return (
                    <li key={piece.id} className={styles.piece}>
                      <h4 className={styles.pieceName}>{piece.name}</h4>
                      {piece.summary && <p className={styles.pieceSummary}>{piece.summary}</p>}
                      <p className={styles.holder} data-free={!holder || undefined}>
                        {!holder ? b.pieces.nobody : holder.username === me.username ? b.pieces.you : fill(b.pieces.other, { name: holder.display_name })}
                      </p>
                      {(piece.can_claim || piece.can_release) && (
                        <div className={styles.phaseActions}>
                          <button
                            type="button"
                            className={landing.ghost}
                            aria-label={fill(piece.can_claim ? b.pieces.claimLabel : b.pieces.freeLabel, { name: piece.name })}
                            aria-busy={busy === key || undefined}
                            aria-disabled={(!!busy && busy !== key) || undefined}
                            onClick={() =>
                              send("pieces", key, async () => {
                                if (piece.can_claim) {
                                  replace(await claimPiece(hub.id, piece.id));
                                  return { text: fill(b.pieces.claimed, { name: piece.name }), focus: true };
                                }
                                await releasePiece(hub.id, piece.id);
                                replace({ ...piece, claimed_by: null, claimed_at: null, can_claim: true, can_release: false });
                                return { text: fill(b.pieces.freed, { name: piece.name }), focus: true };
                              })
                            }
                          >
                            {piece.can_claim ? b.pieces.claim : b.pieces.free}
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {says("pieces")}
          </section>
          <Repository shared={{ ...shared, send: sendIn("repository") }} build={build} linkable={linkable} said={says("repository")} />
          <Commits shared={{ ...shared, send: sendIn("commits") }} build={build} linkable={linkable} now={now} said={says("commits")} />
        </>
      )}
    </section>
  );
}
