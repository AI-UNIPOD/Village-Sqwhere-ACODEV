"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./app-frame.module.css";
import { copy as shared } from "./landing/copy";
import landing from "./landing/landing-page.module.css";
import { LANGUAGE_NAMES, type Lang } from "./locales";
import { Logo } from "./logo";
import { useSession } from "./session/session";
import { SignOutButton } from "./session/session-ui";

// The header and the page around every screen for a signed-in developer, so their loading and
// error screens keep the way home and the language switch too. `path` is the screen's address
// after the language: the switch opens the same screen in the other language.
export function AppFrame({ lang, path, children }: { lang: Lang; path: string; children: ReactNode }) {
  const other: Lang = lang === "en" ? "fr" : "en";
  const signedIn = !!useSession();
  return (
    <div className={styles.page}>
      <header className={styles.header} data-site-header="">
        {/* home is the village once signed in, the landing page until then */}
        <Link className={`${landing.brand} ${styles.brand}`} href={signedIn ? `/${lang}/village` : `/${lang}`}>
          <Logo size={32} className={landing.navLogo} />
          <span className={`${landing.navWordmark} ${styles.wordmark}`} translate="no">Village Sqwhere</span>
        </Link>
        <div className={styles.headerLinks}>
          {/* A plain link on purpose: a full page load, as on the landing page. */}
          <a className={landing.navLink} href={`/${other}/${path}`} hrefLang={other} lang={other} translate="no">
            {LANGUAGE_NAMES[other]}
          </a>
          {signedIn && <SignOutButton lang={lang} label={shared[lang].signOut} className={landing.navLink} />}
        </div>
      </header>
      {children}
    </div>
  );
}
