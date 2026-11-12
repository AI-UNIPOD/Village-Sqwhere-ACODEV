import Link from "next/link";
import type { ReactNode } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { Logo } from "../logo";
import { copy } from "./copy";
import styles from "./onboarding.module.css";

// The header and the page around every onboarding screen, so the loading and error screens
// keep the way home and the language switch too.
export function OnboardingFrame({ lang, children }: { lang: Lang; children: ReactNode }) {
  const other: Lang = lang === "en" ? "fr" : "en";
  return (
    <div className={styles.page}>
      <header className={styles.header} data-site-header="">
        <Link className={`${landing.brand} ${styles.brand}`} href={`/${lang}`}>
          <Logo size={32} className={landing.navLogo} />
          <span className={landing.navWordmark} translate="no">Village Sqwhere</span>
        </Link>
        {/* A plain link on purpose: a full page load, as on the landing page. */}
        <a
          className={landing.navLink}
          href={`/${other}/onboarding`}
          hrefLang={other}
          lang={other}
          translate="no"
        >
          {copy[lang].switchText}
        </a>
      </header>
      {children}
    </div>
  );
}
