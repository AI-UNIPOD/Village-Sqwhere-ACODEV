"use client";

import { AppFrame } from "../app-frame";
import ideas from "../ideas/ideas.module.css";
import { copy as shared } from "../landing/copy";
import landing from "../landing/landing-page.module.css";
import { LANGUAGE_NAMES, LOCALES, type Lang } from "../locales";
import onboarding from "../onboarding/onboarding.module.css";
import { keepMe, useMe } from "../session/me";
import { RequireSession, SignOutButton } from "../session/session-ui";
import { copy } from "./copy";
import { DeleteAccount } from "./delete-account";
import styles from "./profile.module.css";
import { RolesSection } from "./roles-section";
import { SectorsSection, StackSection } from "./stack-section";
import { YouSection } from "./you-section";

// Shown while the profile loads: blocks where the sections will be.
export function ProfileSkeleton({ lang }: { lang: Lang }) {
  return (
    <main className={`${onboarding.column} ${ideas.main}`} aria-busy="true">
      <p className={landing.srOnly} role="status">
        {copy[lang].loading}
      </p>
      <div className={onboarding.skeleton} aria-hidden="true">
        <div className={`${onboarding.block} ${onboarding.blockTitle}`} />
        <div className={`${onboarding.block} ${onboarding.blockText}`} />
        <div className={onboarding.block} />
        <div className={onboarding.block} />
        <div className={onboarding.spinner} />
      </div>
    </main>
  );
}

function Account({ lang }: { lang: Lang }) {
  const t = copy[lang].account;
  return (
    <section className={ideas.section} aria-labelledby="profile-account">
      <h2 id="profile-account" className={ideas.heading}>
        {t.heading}
      </h2>
      <div className={ideas.field}>
        <p id="profile-language" className={ideas.label}>
          {t.language}
        </p>
        <div role="group" aria-labelledby="profile-language" className={styles.languages}>
          {LOCALES.map((code) => (
            // plain links on purpose: a full page load, as the header's language link does
            <a
              key={code}
              className={`${landing.ghost} ${styles.language}`}
              href={`/${code}/profile`}
              hrefLang={code}
              lang={code}
              translate="no"
              aria-current={code === lang ? "true" : undefined}
            >
              {LANGUAGE_NAMES[code]}
            </a>
          ))}
        </div>
      </div>
      <div className={styles.account}>
        <SignOutButton lang={lang} label={shared[lang].signOut} className={landing.ghost} />
      </div>
    </section>
  );
}

function Profile({ lang }: { lang: Lang }) {
  const me = useMe();
  if (!me) return <ProfileSkeleton lang={lang} />;

  const t = copy[lang];
  // a change is kept for the visit, so the village and the header show it too
  const onMe = keepMe;
  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <h1 className={ideas.title}>{t.title}</h1>
      <p className={ideas.lead}>{t.lead}</p>
      <YouSection lang={lang} me={me} onMe={onMe} />
      <RolesSection lang={lang} me={me} onMe={onMe} />
      <StackSection lang={lang} me={me} onMe={onMe} />
      <SectorsSection lang={lang} me={me} onMe={onMe} />
      <Account lang={lang} />
      <DeleteAccount lang={lang} username={me.username} />
    </main>
  );
}

// The developer's own page: the name and bio others see, the roles they hold, their stack and sectors.
export function ProfilePage({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="profile">
      <RequireSession lang={lang} fallback={<ProfileSkeleton lang={lang} />}>
        <Profile lang={lang} />
      </RequireSession>
    </AppFrame>
  );
}
