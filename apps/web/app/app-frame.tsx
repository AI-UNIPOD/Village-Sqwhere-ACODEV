"use client";

import Link from "next/link";
import { ViewTransition, type ReactNode } from "react";

import { copy } from "./app-frame-copy";
import styles from "./app-frame.module.css";
import { copy as shared } from "./landing/copy";
import landing from "./landing/landing-page.module.css";
import { ThemeButton } from "./landing/theme-toggle";
import { LANGUAGE_NAMES, type Lang } from "./locales";
import { Logo } from "./logo";
import { Home, Lightbulb, ShieldCheck, User, Users } from "./onboarding/icons";
import { useKeptMe } from "./session/me";
import { useSession } from "./session/session";
import { SignOutButton } from "./session/session-ui";

// The places a signed-in developer can go, in the order of the journey. Each id is also the
// first part of its address and its key in the copy.
const PLACES = [
  { id: "village", icon: Home },
  { id: "ideas", icon: Lightbulb },
  { id: "hubs", icon: Users },
  { id: "reviews", icon: ShieldCheck },
  { id: "profile", icon: User },
] as const;

type AppFrameProps = {
  lang: Lang;
  /** The screen's address after the language: the language link opens the same screen. */
  path: string;
  /** Leaving ends something for good (a live interview): the frame offers no way out. */
  locked?: boolean;
  /** Before the developer has a profile (onboarding): the header only, with sign out. */
  bare?: boolean;
  children: ReactNode;
};

// The header and the page around every screen for a signed-in developer, so their loading and
// error screens keep the way around too. On a phone the places sit in a bar at the bottom of
// the screen, within reach of a thumb; on a wide screen they are links in the header. It is one
// list either way, placed by the stylesheet.
export function AppFrame({ lang, path, locked, bare, children }: AppFrameProps) {
  const t = copy[lang];
  const other: Lang = lang === "en" ? "fr" : "en";
  const signedIn = !!useSession();
  const me = useKeptMe();
  const places = signedIn && !locked && !bare;
  // "ideas/compose?id=1" is in "ideas"
  const here = path.split(/[/?]/)[0];
  const brand = (
    <>
      <Logo size={32} className={landing.navLogo} />
      <span className={`${landing.navWordmark} ${styles.wordmark}`} translate="no">Village Sqwhere</span>
    </>
  );
  return (
    <div className={styles.page} data-places={places || undefined}>
      <header className={styles.header} data-site-header="">
        {locked ? (
          <span className={`${landing.brand} ${styles.brand}`}>{brand}</span>
        ) : (
          // home is the village once signed in, the landing page until then
          <Link className={`${landing.brand} ${styles.brand}`} href={signedIn ? `/${lang}/village` : `/${lang}`}>
            {brand}
          </Link>
        )}
        {places && (
          <nav className={styles.places} aria-label={t.navLabel}>
            {PLACES.map(({ id, icon: PlaceIcon }) => {
              // deciding other developers' attempts is for those who hold a Green Tick
              if (id === "reviews" && !me?.roles.some((role) => role.verified_at)) return null;
              const current = id === here;
              return (
                <Link key={id} className={styles.place} href={`/${lang}/${id}`} aria-current={current ? "page" : undefined}>
                  <PlaceIcon />
                  {t[id]}
                  {/* the mark keeps one name across screens, so it slides to the place just opened */}
                  {current && (
                    <ViewTransition name="place-mark" share="place-mark">
                      <span className={styles.mark} />
                    </ViewTransition>
                  )}
                </Link>
              );
            })}
          </nav>
        )}
        {!locked && (
          <div className={styles.tools}>
            {/* A plain link on purpose: a full page load, as on the landing page. */}
            <a className={landing.navLink} href={`/${other}/${path}`} hrefLang={other} lang={other} translate="no">
              {LANGUAGE_NAMES[other]}
            </a>
            <ThemeButton toDark={shared[lang].toDark} toLight={shared[lang].toLight} className={styles.theme} />
            {/* once there is a profile page to reach, signing out lives there */}
            {signedIn && bare && <SignOutButton lang={lang} label={shared[lang].signOut} className={landing.navLink} />}
          </div>
        )}
      </header>
      {/* a new screen fades in as the old one fades out (globals.css) */}
      <ViewTransition enter="screen" exit="screen" default="none">
        {children}
      </ViewTransition>
    </div>
  );
}
