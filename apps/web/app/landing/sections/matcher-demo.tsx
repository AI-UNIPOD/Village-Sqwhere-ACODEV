"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

import type { Lang } from "../../locales";
import { parseSeconds } from "../gather";
import { HeadingText } from "../heading-text";
import page from "../landing-page.module.css";
import { copy } from "./matcher-demo-copy";
import styles from "./matcher-demo.module.css";

/**
 * idle: waiting for the visitor (or for the section to scroll into view the first time)
 * running: the matcher's four status lines, one after another
 * results: three suggestions and the invite button
 * inviting: invitations sent, the three sign one after another
 * won: the team is formed and the hub is open
 */
type Phase = "idle" | "running" | "results" | "inviting" | "won";

// How long each beat holds. The status lines and the signatures are read, so they stay up a
// little longer than a UI transition; the whole run is under two seconds.
const RUN_STEP_MS = 450;
const SIGN_STEP_MS = 500;

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

const firstName = (name: string) => name.split(" ")[0];

const at = (i: number) => ({ "--i": i }) as CSSProperties;

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" pathLength={1} />
    </svg>
  );
}

// The match score's step (docs/design-system/components.md): 80 and above, 60 to 79, 40 to 59,
// below 40.
const stepOf = (score: number) => (score >= 80 ? 0 : score >= 60 ? 1 : score >= 40 ? 2 : 3);

type ScoreProps = {
  value: number;
  count: boolean;
  steps: readonly string[];
  line: (score: number, step: string) => string;
};

// A simulated match score, drawn as the design system's match score: the number, its step as a
// pill underneath. Match scores are planned; today's matcher has none, and the panel says so.
// Right after the matcher has run it counts up once (a strong one swells a little at the end);
// otherwise, and with reduced motion, it shows at once.
function Score({ value, count, steps, line }: ScoreProps) {
  const [counting] = useState(() => count && !still());
  const [shown, setShown] = useState(counting ? 0 : value);
  useEffect(() => {
    if (!counting) return;
    const ms = (parseSeconds(getComputedStyle(document.documentElement).getPropertyValue("--dur-moment")) ?? 0.52) * 1000;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setShown(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [counting, value]);
  const step = stepOf(value);
  return (
    <p className={styles.score} data-step={step}>
      <span className={page.srOnly}>{line(value, steps[step])}</span>
      <span className={styles.scoreValue} data-swell={(counting && step === 0) || undefined} aria-hidden="true">
        {shown}
      </span>
      <span className={styles.scorePill} aria-hidden="true">
        {step === 0 && <Check className={styles.scoreIcon} />}
        {steps[step]}
      </span>
    </p>
  );
}

// The matcher, played with made-up ideas: pick one, watch it suggest three verified developers,
// invite them, and see the team form. The server draws the first idea's suggestions so the
// section reads without JavaScript; in the browser it waits and runs the first time it is seen.
export function MatcherDemo({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const [ideaIndex, setIdeaIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("results");
  const [step, setStep] = useState(0);
  // whether the suggestions on screen came from a run the visitor saw (their scores count up)
  const [ran, setRan] = useState(false);
  const section = useRef<HTMLElement>(null);
  const picker = useRef<HTMLFieldSetElement>(null);
  const id = useId();
  const idea = t.ideas[ideaIndex];

  // Arm the first run: hide the server's suggestions and run them once the section is in view.
  useEffect(() => {
    const el = section.current;
    if (!el || still() || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setPhase("idle");
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        seen.disconnect();
        setRan(true);
        setStep(0);
        setPhase((now) => (now === "idle" ? "running" : now));
      },
      { threshold: 0.35 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  // The beats of a run and of the signing, one timer at a time.
  useEffect(() => {
    if (phase === "running") {
      const last = step === t.run.length - 1;
      const timer = window.setTimeout(() => (last ? setPhase("results") : setStep(step + 1)), RUN_STEP_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "inviting") {
      const last = step === idea.matches.length;
      const timer = window.setTimeout(() => (last ? setPhase("won") : setStep(step + 1)), SIGN_STEP_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase, step, t.run.length, idea.matches.length]);

  function pick(index: number) {
    setRan(true);
    setIdeaIndex(index);
    setStep(0);
    setPhase(still() ? "results" : "running");
  }

  function invite() {
    setStep(0);
    setPhase(still() ? "won" : "inviting");
  }

  function again() {
    setPhase("idle");
    picker.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }

  const shown = phase === "results" || phase === "inviting" || phase === "won";
  const signedCount = phase === "won" ? idea.matches.length : phase === "inviting" ? Math.min(step, 3) : 0;
  const announcement =
    phase === "won" ? idea.win : phase === "results" ? t.done : phase === "running" ? t.run[step] : "";

  return (
    <section ref={section} className={`${page.block} ${page.warm}`} data-tile-bg="" id="matcher" aria-labelledby={`${id}-title`}>
      <div className={page.wrap}>
        <h2 id={`${id}-title`}>
          <HeadingText text={t.title} />
        </h2>
        <p className={page.lead}>{t.lead}</p>

        <div className={styles.stage}>
          <fieldset ref={picker} className={styles.picker}>
            <legend className={styles.legend}>{t.pickLabel}</legend>
            {t.ideas.map((option, i) => (
              <label key={option.title} className={styles.option}>
                <input
                  type="radio"
                  name={`${id}-idea`}
                  className={styles.radio}
                  checked={i === ideaIndex && phase !== "idle"}
                  onChange={() => pick(i)}
                />
                <span className={styles.optionTitle}>{option.title}</span>
                <span className={styles.optionMeta}>{t.sharedBy(option.owner, option.place)}</span>
              </label>
            ))}
            <p className={styles.note}>{t.sampleNote}</p>
          </fieldset>

          <div className={styles.panel} data-phase={phase}>
            <div className={styles.ideaHead}>
              <p className={styles.ideaTitle}>{idea.title}</p>
              <p className={styles.pitch}>{idea.pitch}</p>
              <p className={styles.rolesLabel}>{t.rolesNeeded}</p>
              <ul className={styles.roles}>
                {idea.roles.map((role) => (
                  <li key={role}>{role}</li>
                ))}
              </ul>
            </div>

            {/* the matcher at work: Lagoon, because the AI is doing it */}
            <div className={styles.status}>
              {phase === "idle" && <p className={styles.waiting}>{t.waiting}</p>}
              {phase === "running" && (
                <>
                  <p className={styles.runLine} key={step}>
                    {t.run[step]}
                  </p>
                  <span
                    className={styles.progress}
                    aria-hidden="true"
                    style={{ "--done": (step + 1) / t.run.length } as CSSProperties}
                  />
                </>
              )}
              {shown && (
                <p className={styles.tag} data-quiet={phase !== "results" || undefined}>
                  {t.tag}
                </p>
              )}
            </div>

            {phase === "running" && (
              <ol className={styles.skeletons} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li key={i} style={at(i)} />
                ))}
              </ol>
            )}

            {shown && (
              <ol className={styles.matches} data-thread={phase === "results" ? "ai" : "people"}>
                {idea.matches.map((match, i) => (
                  <li key={match.name} className={styles.match} style={at(i)} data-signed={i < signedCount || undefined}>
                    <span className={styles.rank} aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className={styles.avatar} aria-hidden="true">
                      {initials(match.name)}
                    </span>
                    <div className={styles.who}>
                      <p className={styles.name}>{match.name}</p>
                      <p className={styles.place}>{match.place}</p>
                      <p className={styles.role}>
                        <Check className={styles.verifiedIcon} />
                        <span>
                          {t.verified}: {match.role}
                        </span>
                      </p>
                      <p className={styles.shared}>{t.inCommon(firstName(idea.owner))}</p>
                      <ul className={styles.chips} aria-label={t.inCommon(firstName(idea.owner))}>
                        {match.shared.map((tech) => (
                          <li key={tech}>{tech}</li>
                        ))}
                      </ul>
                      {i < signedCount && (
                        <p className={styles.signed}>
                          <Check className={styles.signedIcon} />
                          <span>{t.signed(match.name)}</span>
                        </p>
                      )}
                    </div>
                    <Score value={match.score} count={ran} steps={t.steps} line={t.scoreLine} />
                  </li>
                ))}
              </ol>
            )}

            {shown && <p className={styles.simulated}>{t.simulated}</p>}

            {shown && (
              <div className={styles.foot}>
                {phase === "won" ? (
                  <div className={styles.win}>
                    <span className={styles.team} aria-hidden="true">
                      {[idea.owner, ...idea.matches.map((m) => m.name)].map((name, i) => (
                        <span key={name} className={styles.teamAvatar} style={at(i)}>
                          {initials(name)}
                        </span>
                      ))}
                    </span>
                    <p className={styles.winText}>{idea.win}</p>
                    <div className={styles.winActions}>
                      <button type="button" className={page.ghost} onClick={again}>
                        {t.again}
                      </button>
                      <a className={styles.bridge} href="#green-tick">
                        {t.bridge}
                      </a>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className={page.btn}
                      onClick={invite}
                      disabled={phase === "inviting"}
                      aria-busy={phase === "inviting" || undefined}
                    >
                      {phase === "inviting" ? t.inviting : t.invite}
                    </button>
                    <a className={styles.bridge} href="#green-tick">
                      {t.bridge}
                    </a>
                  </>
                )}
              </div>
            )}

            <p className={page.srOnly} aria-live="polite">
              {announcement}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
