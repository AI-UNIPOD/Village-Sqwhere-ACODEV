"use client";

import Link from "next/link";

import landing from "../landing/landing-page.module.css";
import { Logo } from "../logo";
import { useLang } from "../onboarding/use-lang";
import { copy } from "../page-error/copy";
import styles from "../page-error/error-page.module.css";

// Catches errors in every page under /en and /fr except onboarding, which has its own error
// file. It gets no props but retry, so the language comes from the address.
export default function LangError({ retry }: { retry: () => void }) {
  const lang = useLang();
  const t = copy[lang];
  return (
    <>
      <header className={landing.nav}>
        <Link className={landing.brand} href={`/${lang}`}>
          <Logo size={24} className={landing.navLogo} />
          <span className={landing.navWordmark} translate="no">Village Sqwhere</span>
        </Link>
      </header>
      <main className={styles.main}>
        <h1 className={styles.title}>{t.heading}</h1>
        <p className={styles.text}>{t.text}</p>
        <div className={styles.actions}>
          <button type="button" className={landing.btn} onClick={retry}>
            {t.retry}
          </button>
          <Link className={landing.ghost} href={`/${lang}`}>
            {t.home}
          </Link>
        </div>
      </main>
    </>
  );
}
