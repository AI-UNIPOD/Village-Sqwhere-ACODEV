import Link from "next/link";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { Logo } from "../logo";
import { copy } from "./copy";
import { Gathering } from "./gathering";
import styles from "./not-found-page.module.css";
import { OtherPlaces, WaysBack } from "./ways-out";

// The page for an address that leads nowhere. In reading order: what happened, the two ways
// most people want (home, and back to where they were), a small scene to play with, then the
// places they may have been looking for.
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
        <div className={styles.message}>
          <h1 className={styles.title}>{t.heading}</h1>
          <p className={styles.text}>{t.text}</p>
          <WaysBack lang={lang} />
        </div>
        <Gathering lang={lang} />
        <OtherPlaces lang={lang} />
      </main>
    </>
  );
}
