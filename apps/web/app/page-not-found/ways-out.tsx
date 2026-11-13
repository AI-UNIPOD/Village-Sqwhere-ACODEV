"use client";

import Link from "next/link";
import { useId, useSyncExternalStore } from "react";

import { copy as frame } from "../app-frame-copy";
import { copy as landingCopy } from "../landing/copy";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { ArrowLeft, Home, Lightbulb, User, Users } from "../onboarding/icons";
import { useSession } from "../session/session";
import { copy } from "./copy";
import styles from "./not-found-page.module.css";

/** The longest address shown in full. A longer one is cut, so a pasted paragraph cannot fill the page. */
export const ASKED_MAX = 60;

// These never change while the page is open, so there is nothing to listen for.
const never = () => () => {};

// The address as the visitor typed it: decoded when it can be, and never longer than a line or two.
function readAsked(): string {
  let path = window.location.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // a broken escape: show it as it was sent
  }
  return path.length > ASKED_MAX ? `${path.slice(0, ASKED_MAX)}…` : path;
}

// The first ways out of a page that does not exist: home, and back to the page before. What
// they are depends on things only the browser knows (the address, the history, whether someone
// is signed in), so the server's version is the one for a visitor: the home page.
export function WaysBack({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const signedIn = !!useSession();
  const asked = useSyncExternalStore(never, readAsked, () => null);
  const canGoBack = useSyncExternalStore(
    never,
    () => window.history.length > 1,
    () => false,
  );
  return (
    <>
      {/* the line keeps its room while the address is not known yet, so nothing jumps */}
      <p className={styles.asked}>
        {asked && (
          <>
            {t.asked} <code translate="no">{asked}</code>
          </>
        )}
      </p>
      <div className={styles.actions}>
        <Link className={landing.btn} href={signedIn ? `/${lang}/village` : `/${lang}`}>
          <Home />
          {signedIn ? t.village : t.home}
        </Link>
        {canGoBack && (
          <button type="button" className={landing.ghost} onClick={() => window.history.back()}>
            <ArrowLeft />
            {t.back}
          </button>
        )}
      </div>
    </>
  );
}

// The places most people were looking for: the developer's own once signed in, and for a
// visitor how the village works and the way in.
export function OtherPlaces({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const heading = useId();
  const places = useSession()
    ? [
        { href: `/${lang}/ideas`, label: frame[lang].ideas, icon: Lightbulb },
        { href: `/${lang}/hubs`, label: frame[lang].hubs, icon: Users },
        { href: `/${lang}/profile`, label: frame[lang].profile, icon: User },
      ]
    : [
        { href: `/${lang}#how`, label: landingCopy[lang].navHow, icon: Lightbulb },
        { href: `/${lang}/sign-in`, label: t.signIn, icon: User },
      ];
  return (
    <nav className={styles.places} aria-labelledby={heading}>
      <h2 id={heading} className={styles.placesHeading}>
        {t.placesHeading}
      </h2>
      <ul className={styles.placeList}>
        {places.map(({ href, label, icon: PlaceIcon }) => (
          <li key={href}>
            <Link className={`${landing.ghost} ${styles.place}`} href={href}>
              <PlaceIcon />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
