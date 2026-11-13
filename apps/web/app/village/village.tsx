"use client";

import Link from "next/link";

import { AppFrame } from "../app-frame";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { ArrowRight, Check, Clock } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { ROLES, TECHNOLOGIES, firstName, toProfile } from "../onboarding/options";
import { useMe, type Me } from "../session/me";
import { RequireSession } from "../session/session-ui";
import { copy } from "./copy";
import styles from "./village.module.css";

const STEPS = ["profile", "verify", "idea", "hub"] as const;
// "next" is the one step to do now; "open" can be started too, without being the main thing
type StepState = "done" | "next" | "open" | "later";

const ICONS = { done: Check, next: ArrowRight, open: ArrowRight, later: Clock };

// Shown while the profile loads: blocks where the card and the steps will be.
export function VillageSkeleton({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="village">
      <main className={`${onboarding.column} ${styles.main}`} aria-busy="true">
        <p className={landing.srOnly} role="status">
          {copy[lang].loading}
        </p>
        <div className={onboarding.skeleton} aria-hidden="true">
          <div className={`${onboarding.block} ${onboarding.blockTitle}`} />
          <div className={onboarding.block} />
          <div className={`${onboarding.block} ${onboarding.blockText}`} />
          <div className={onboarding.block} />
          <div className={onboarding.spinner} />
        </div>
      </main>
    </AppFrame>
  );
}

function Home({ lang, me }: { lang: Lang; me: Me }) {
  const t = copy[lang];
  const profile = toProfile(me);
  const name = profile.displayName ?? profile.username;
  const role = me.roles.find((r) => r.is_primary) ?? me.roles[0];
  const verified = !!role?.verified_at;
  const attemptUnderWay = ["pending", "in_progress", "awaiting_review"].includes(role?.verification?.latest_status ?? "");
  // Sharing an idea needs a role but not a Green Tick, so it opens beside verifying. Hubs open
  // here when their screen exists.
  const states: Record<(typeof STEPS)[number], StepState> = {
    profile: role ? "done" : "next",
    verify: !role ? "later" : verified ? "done" : "next",
    idea: role ? "next" : "later",
    hub: "later",
  };
  // one main button on the screen: the first step still to do. The others that can start are "open".
  const first = STEPS.find((id) => states[id] === "next");
  for (const id of STEPS) if (states[id] === "next" && id !== first) states[id] = "open";
  const button = (id: (typeof STEPS)[number]) => `${id === first ? landing.btn : landing.ghost} ${styles.action}`;
  const github = (text: string) => (
    <a href={`https://github.com/${encodeURIComponent(profile.username)}`} target="_blank" rel="noopener noreferrer">
      {text} <span className={landing.srOnly}>({t.githubProfile})</span>
    </a>
  );
  return (
    <AppFrame lang={lang} path="village">
      <main className={`${onboarding.column} ${styles.main}`}>
        <h1 className={styles.title}>{fill(t.title, { name: firstName(profile) })}</h1>

        <div className={styles.identity}>
          <div className={styles.person}>
            <span className={styles.avatar} aria-hidden="true">
              {name
                .split(" ")
                .map((word) => word[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <p className={styles.name}>{profile.displayName ?? github(profile.username)}</p>
              {profile.displayName && <p className={styles.username}>{github(`@${profile.username}`)}</p>}
            </div>
          </div>
          <p className={styles.role}>
            {role ? (ROLES.find((r) => r.slug === role.slug)?.name[lang] ?? role.name) : t.noRole}
            {role && (
              <span className={styles.pill} data-state={verified ? "done" : "later"}>
                {verified ? <Check /> : <Clock />}
                {verified ? t.verified : t.notVerified}
              </span>
            )}
          </p>
          {me.technologies.length > 0 && (
            <div>
              <p className={styles.label}>{t.stackLabel}</p>
              <ul className={styles.tags}>
                {me.technologies.map((tech) => (
                  <li key={tech.slug} className={styles.tag}>
                    {TECHNOLOGIES.find((known) => known.slug === tech.slug)?.name[lang] ?? tech.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <h2 className={styles.subtitle}>{t.pathTitle}</h2>
        <p className={styles.lead}>{t.pathLead}</p>
        <ol className={styles.path}>
          {STEPS.map((id, i) => {
            const state = states[id];
            const StateIcon = ICONS[state];
            return (
              <li key={id} className={styles.step} data-state={state}>
                <span className={styles.num} aria-hidden="true">
                  {state === "done" ? <Check /> : String(i + 1).padStart(2, "0")}
                </span>
                <div className={styles.body}>
                  <div className={styles.stepHead}>
                    <h3>{t.steps[id].title}</h3>
                    <span className={styles.pill} data-state={state}>
                      <StateIcon />
                      {t[state]}
                    </span>
                  </div>
                  <p>{t.steps[id].text}</p>
                  {id === "profile" && (
                    <Link
                      className={`${role ? landing.ghost : landing.btn} ${styles.action}`}
                      // the profile page changes a profile; onboarding makes the first one
                      href={role ? `/${lang}/profile` : `/${lang}/onboarding?step=role`}
                    >
                      {role ? t.change : t.setUp}
                    </Link>
                  )}
                  {id === "verify" && state === "next" && (
                    <Link className={button(id)} href={`/${lang}/verification`}>
                      {attemptUnderWay ? t.verifyContinue : t.verifyStart}
                    </Link>
                  )}
                  {id === "idea" && (state === "next" || state === "open") && (
                    <div className={styles.actions}>
                      <Link className={button(id)} href={`/${lang}/ideas/mine`}>
                        {t.ideas}
                      </Link>
                      <Link className={`${landing.ghost} ${styles.action}`} href={`/${lang}/ideas`}>
                        {t.browse}
                      </Link>
                    </div>
                  )}
                  {/* a hub is created from an open idea; this leads to the ones you are in */}
                  {id === "hub" && role && (
                    <Link className={`${landing.ghost} ${styles.action}`} href={`/${lang}/hubs`}>
                      {t.hubs}
                    </Link>
                  )}
                  {/* a Green Tick is also the right to decide other developers' attempts */}
                  {id === "verify" && state === "done" && (
                    <Link className={`${landing.ghost} ${styles.action}`} href={`/${lang}/reviews`}>
                      {t.review}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </main>
    </AppFrame>
  );
}

function WithMe({ lang }: { lang: Lang }) {
  const me = useMe();
  return me ? <Home lang={lang} me={me} /> : <VillageSkeleton lang={lang} />;
}

// The signed-in developer's home: who they are, and where they stand on the way to a team.
export function Village({ lang }: { lang: Lang }) {
  return (
    <RequireSession lang={lang} fallback={<VillageSkeleton lang={lang} />}>
      <WithMe lang={lang} />
    </RequireSession>
  );
}
