"use client";

import { useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "../confirm-dialog";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle, CircleDashed, Check, Clock } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { SignedOutError } from "../session/session";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { confirmTeam, loadHub, movePhase, PHASES, type Hub, type PhaseState } from "./hubs-api";
import styles from "./hubs.module.css";

const PILLS: Record<PhaseState, { state: string; Icon: typeof Check }> = {
  done: { state: "done", Icon: Check },
  in_progress: { state: "next", Icon: Clock },
  not_started: { state: "later", Icon: CircleDashed },
};

// The hub changed in another tab or window: the action no longer fits where the hub is.
const CHANGED = ["TEAM_ALREADY_CONFIRMED", "PHASE_NOT_ADJACENT", "TEAM_NOT_CONFIRMED"];
const UNAVAILABLE = ["HUB_ARCHIVED", "NOT_HUB_OWNER"];

type Action = "confirm" | "forward" | "back";

// The hub's four phases with where each stands. The owner of an active hub confirms the team and
// moves the hub forward or back, each behind a confirmation. The buttons are all quiet ones: the
// owner's invite form above already holds the page's one main button.
export function Phases({ lang, hub, onChange }: { lang: Lang; hub: Hub; onChange: (hub: Hub) => void }) {
  const t = copy[lang];
  const a = t.phaseActions;
  const [asking, setAsking] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const at = hub.phase ? PHASES.indexOf(hub.phase) : -1;
  // no next step before the team is confirmed (the first phase opens by confirming), and none in review
  const next = hub.phase ? PHASES[at + 1] : undefined;
  const previous = at > 0 ? PHASES[at - 1] : undefined;
  const canAct = hub.viewer.member_role === "owner" && hub.status === "active";
  const note = hub.phase
    ? t.phasesNote.confirmed
    : hub.status !== "active"
      ? t.phasesNote.archived
      : hub.viewer.member_role === "owner"
        ? t.phasesNote.toConfirm
        : t.phasesNote.waiting;

  // The button that was pressed can vanish with the change (confirming, reaching the first or
  // last phase, or a hub that had moved elsewhere), and so does the open dialog: the line that
  // says what happened takes the person's place. Only one of the two lines shows at a time.
  const said = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice || problem) said.current?.focus();
  }, [notice, problem]);

  async function run(action: Action) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setProblem(null);
    try {
      if (action === "confirm") {
        onChange(await confirmTeam(hub.id));
        setNotice(a.confirm.done);
      } else {
        const target = action === "forward" ? next : previous;
        if (!target) return;
        onChange(await movePhase(hub.id, target));
        setNotice(fill(a[action].done, { phase: t.phases[target] }));
      }
    } catch (error) {
      if (error instanceof SignedOutError) return;
      // in the demo the frame says why; "try again" would be wrong
      if (error instanceof IdeaError && error.code === "DEMO_READ_ONLY") return;
      const code = error instanceof IdeaError ? error.code : "";
      if (CHANGED.includes(code) || UNAVAILABLE.includes(code)) {
        // show the hub as it is now, so the buttons fit it
        try {
          onChange(await loadHub(hub.id));
          setProblem(CHANGED.includes(code) ? a.errors.changed : a.errors.unavailable);
        } catch (reload) {
          if (!(reload instanceof SignedOutError)) setProblem(a.errors.failed);
        }
      } else setProblem(a.errors.failed);
    } finally {
      setBusy(false);
      setAsking(null);
    }
  }

  const button = (action: Action, label: string) => (
    <button type="button" className={landing.ghost} aria-busy={busy || undefined} onClick={() => !busy && setAsking(action)}>
      {label}
    </button>
  );
  const dialog = (action: Action, title: string, text: string, label: string) => (
    <ConfirmDialog
      open={asking === action}
      title={title}
      confirm={label}
      cancel={a.cancel}
      busy={busy}
      onConfirm={() => run(action)}
      onCancel={() => setAsking(null)}
    >
      <p>{text}</p>
    </ConfirmDialog>
  );
  const nextName = next && t.phases[next];
  const previousName = previous && t.phases[previous];

  return (
    <section id="phases" className={styles.part}>
      <h2 className={`${ideas.heading} ${styles.heading}`}>{t.phasesHeading}</h2>
      <ol className={styles.phases}>
        {hub.phases.map(({ phase, state }, index) => {
          const { state: tint, Icon } = PILLS[state];
          return (
            <li key={phase} aria-current={state === "in_progress" ? "step" : undefined}>
              <span className={styles.num} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className={styles.strong}>{t.phases[phase]}</span>
              <span className={village.pill} data-state={tint}>
                <Icon />
                {t.phaseStates[state]}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={ideas.lead}>{note}</p>
      {notice && (
        <p ref={said} tabIndex={-1} className={ideas.done} role="status">
          <Check />
          {notice}
        </p>
      )}
      {problem && (
        <p ref={said} tabIndex={-1} className={`${onboarding.error} ${styles.problem}`} role="alert">
          <AlertCircle />
          {problem}
        </p>
      )}
      {canAct && (
        <>
          <div className={styles.phaseActions}>
            {!hub.phase && button("confirm", a.confirm.button)}
            {nextName && button("forward", fill(a.forward.button, { phase: nextName }))}
            {previousName && button("back", fill(a.back.button, { phase: previousName }))}
          </div>
          {!hub.phase &&
            dialog("confirm", a.confirm.title, hub.member_count === 1 ? a.confirm.alone : fill(a.confirm.text, { n: hub.member_count }), a.confirm.button)}
          {nextName &&
            dialog("forward", fill(a.forward.title, { phase: nextName }), fill(a.forward.text, { phase: nextName }), fill(a.forward.button, { phase: nextName }))}
          {previousName &&
            dialog("back", fill(a.back.title, { phase: previousName }), fill(a.back.text, { phase: previousName }), fill(a.back.button, { phase: previousName }))}
        </>
      )}
    </section>
  );
}
