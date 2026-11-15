"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AppFrame } from "../app-frame";
import { IdeaError } from "../ideas/ideas-api";
import ideas from "../ideas/ideas.module.css";
import { roleName, sectorName, technologyName } from "../ideas/names";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { ArrowLeft, Check } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { countriesFor } from "../onboarding/options";
import { useKeptMe } from "../session/me";
import { SignedOutError } from "../session/session";
import { RequireSession } from "../session/session-ui";
import village from "../village/village.module.css";
import { copy } from "./copy";
import { loadPerson, type Person } from "./people-api";

export function PersonSkeleton({ lang }: { lang: Lang }) {
  return (
    <main className={`${onboarding.column} ${ideas.main}`} aria-busy="true">
      <p className={landing.srOnly} role="status">
        {copy[lang].loading}
      </p>
      <div className={onboarding.skeleton} aria-hidden="true">
        <div className={`${onboarding.block} ${onboarding.blockTitle}`} />
        <div className={`${onboarding.block} ${onboarding.blockText}`} />
        <div className={onboarding.block} />
        <div className={onboarding.spinner} />
      </div>
    </main>
  );
}

// The whole page while it loads, for the route's Suspense boundary.
export function PersonLoading({ lang }: { lang: Lang }) {
  return (
    <AppFrame lang={lang} path="people/view">
      <PersonSkeleton lang={lang} />
    </AppFrame>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <ul className={`${village.tags} ${ideas.block}`} aria-label={label}>
      {items.map((item) => (
        <li key={item} className={village.tag}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Profile({ lang, username }: { lang: Lang; username: string | null }) {
  const t = copy[lang];
  const me = useKeptMe();
  // undefined while loading, null when nobody has this username (or the address has none)
  const [person, setPerson] = useState<Person | null | undefined>(username ? undefined : null);
  const [failure, setFailure] = useState<Error | null>(null);

  useEffect(() => {
    if (!username) return;
    let live = true;
    loadPerson(username).then(
      (found) => live && setPerson(found),
      (error: unknown) => {
        if (!live || error instanceof SignedOutError) return;
        if (error instanceof IdeaError && error.status === 404) setPerson(null);
        else setFailure(error instanceof Error ? error : new Error(String(error)));
      },
    );
    return () => {
      live = false;
    };
  }, [username]);

  if (failure) throw failure;
  if (person === null) {
    return (
      <main className={`${onboarding.column} ${onboarding.step}`}>
        <h1 className={onboarding.title}>{t.goneTitle}</h1>
        <p className={onboarding.why}>{t.goneText}</p>
        <div className={onboarding.actions}>
          <Link className={landing.btn} href={`/${lang}/village`}>
            {t.back}
          </Link>
        </div>
      </main>
    );
  }
  if (!person) return <PersonSkeleton lang={lang} />;

  // GitHub accounts without a name get the username as their name: show it once
  const named = person.display_name !== person.username;
  const country = countriesFor(lang).find((known) => known.alpha2 === person.country_code)?.name;
  const yours = me?.username.toLowerCase() === person.username.toLowerCase();
  return (
    <main className={`${onboarding.column} ${ideas.main}`}>
      <Link className={`${onboarding.back} ${ideas.backLink}`} href={`/${lang}/village`}>
        <ArrowLeft />
        {t.back}
      </Link>
      <div className={village.person}>
        <span className={village.avatar} aria-hidden="true">
          {(named ? person.display_name : person.username)
            .split(" ")
            .map((word) => word[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <div>
          <h1 className={ideas.title}>{named ? person.display_name : `@${person.username}`}</h1>
          <p className={ideas.meta}>
            {named && `@${person.username}`}
            {person.is_verified && (
              <span className={ideas.verified}>
                <Check />
                {t.verified}
              </span>
            )}
          </p>
        </div>
      </div>
      {country && (
        <p className={ideas.lead}>{fill(t.country, { country })}</p>
      )}
      {person.bio && <p className={ideas.body}>{person.bio}</p>}

      <h2 className={ideas.heading}>{t.roles}</h2>
      {person.verified_roles.length > 0 ? (
        <Chips label={t.roles} items={person.verified_roles.map((role) => roleName(lang, role))} />
      ) : (
        <p className={`${ideas.meta} ${ideas.block}`}>{t.noRoles}</p>
      )}
      {person.technologies.length > 0 && (
        <>
          <h2 className={ideas.heading}>{t.stack}</h2>
          <Chips label={t.stack} items={person.technologies.map((tech) => technologyName(lang, tech))} />
        </>
      )}
      {person.sectors.length > 0 && (
        <>
          <h2 className={ideas.heading}>{t.sectors}</h2>
          <Chips label={t.sectors} items={person.sectors.map((sector) => sectorName(lang, sector))} />
        </>
      )}

      <div className={onboarding.actions}>
        <a
          className={landing.ghost}
          href={`https://github.com/${encodeURIComponent(person.username)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.github} <span className={landing.srOnly}>({t.newTab})</span>
        </a>
        {yours && (
          <Link className={landing.btn} href={`/${lang}/profile`}>
            {t.editYours}
          </Link>
        )}
      </div>
      {yours && <p className={ideas.note}>{t.yours}</p>}
    </main>
  );
}

// Another developer's profile, by username, for any signed-in developer.
export function PersonPage({ lang }: { lang: Lang }) {
  const username = useSearchParams().get("username");
  return (
    <AppFrame lang={lang} path={`people/view${username ? `?username=${encodeURIComponent(username)}` : ""}`}>
      <RequireSession lang={lang} fallback={<PersonSkeleton lang={lang} />}>
        {/* another person is another page: nothing loaded for one may show for the next */}
        <Profile key={username ?? "none"} lang={lang} username={username} />
      </RequireSession>
    </AppFrame>
  );
}
