import Link from "next/link";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { Logo } from "../logo";
import { copy } from "./copy";
import styles from "./not-found-page.module.css";

export function NotFoundPage({ lang }: { lang: Lang }) {
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
        <Link className={`${landing.btn} ${styles.home}`} href={`/${lang}`}>
          {t.home}
        </Link>
      </main>
    </>
  );
}
