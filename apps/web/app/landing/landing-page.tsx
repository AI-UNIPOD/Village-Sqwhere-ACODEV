import Link from "next/link";
import type { ReactNode } from "react";

import type { Lang } from "../locales";
import { Logo } from "../logo";
import { copy } from "./copy";
import { GatherHero } from "./gather-hero";
import styles from "./landing-page.module.css";
import { ThemeToggle } from "./theme-toggle";

// The demo, the tour and sign-in are not built yet. The control stays visible, stays focusable
// and does nothing, and its name says why, so nobody lands on a dead link.
function SoonButton({
  className,
  soon,
  children,
}: {
  className: string;
  soon: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className={className} aria-disabled="true">
      {children}
      <span className={styles.srOnly}>, {soon}</span>
    </button>
  );
}

function Brand({ lang, logoClass, wordmarkClass }: { lang: Lang; logoClass: string; wordmarkClass: string }) {
  return (
    <Link className={styles.brand} href={`/${lang}`}>
      <Logo size={32} className={logoClass} />
      <span className={wordmarkClass}>Village Sqwhere</span>
    </Link>
  );
}

export function LandingPage({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const other: Lang = lang === "en" ? "fr" : "en";

  return (
    <div className={styles.page}>
      <header className={styles.nav} data-site-header="">
        <Brand lang={lang} logoClass={styles.navLogo} wordmarkClass={styles.navWordmark} />
        <nav className={styles.navLinks} aria-label={t.navLabel}>
          <a className={styles.navLink} href="#how">
            {t.navHow}
          </a>
          <a className={styles.navLink} href="#tour">
            {t.navTour}
          </a>
          <SoonButton className={`${styles.navLink} ${styles.soonLink}`} soon={t.soon}>
            {t.signIn}
          </SoonButton>
        </nav>
      </header>

      {/* A plain link on purpose: a full page load. A client navigation keeps the old language
          hidden in the page and makes React drop the theme set on <html>. */}
      <a
        className={`${styles.fab} ${styles.fabTop}`}
        href={`/${other}`}
        hrefLang={other}
        lang={other}
        aria-label={t.switchLabel}
      >
        {t.switchText}
      </a>
      <ThemeToggle toDark={t.toDark} toLight={t.toLight} />

      <main>
        <GatherHero labelledBy="hero-title" labels={{ pause: t.pause, play: t.play }}>
          <h1 id="hero-title">{t.headline}</h1>
          <p className={styles.sub}>{t.sub}</p>
          <div className={styles.ctas}>
            <SoonButton className={`${styles.btn} ${styles.heroButton}`} soon={t.soon}>
              {t.ctaDemo}
            </SoonButton>
            <a className={`${styles.ghost} ${styles.heroButton}`} href="#tour">
              {t.ctaTour}
            </a>
          </div>
          <p className={styles.note} aria-hidden="true">
            {t.demoNote}
          </p>
        </GatherHero>

        <section className={styles.block} id="how" aria-labelledby="how-title">
          <div className={styles.wrap}>
            <h2 id="how-title">{t.howTitle}</h2>
            <p className={styles.lead}>{t.howLead}</p>
            <ol className={styles.steps}>
              {t.steps.map((step, i) => (
                <li className={styles.step} key={step.title}>
                  <span className={styles.num} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={styles.block} id="tour" aria-labelledby="tour-title">
          <div className={`${styles.wrap} ${styles.tourGrid}`}>
            <div>
              <h2 id="tour-title">{t.tourTitle}</h2>
              <p className={styles.lead}>{t.tourLead}</p>
              <div className={`${styles.noteHost} ${styles.tourButton}`}>
                <SoonButton className={styles.ghost} soon={t.soon}>
                  {t.tourButton}
                </SoonButton>
                <p className={styles.note} aria-hidden="true">
                  {t.tourNote}
                </p>
              </div>
            </div>
            <ol className={styles.stops}>
              {t.stops.map((stop, i) => (
                <li key={stop.text}>
                  <span className={styles.meta} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.what}>{stop.text}</span>
                  <span className={styles.meta}>{stop.time}</span>
                </li>
              ))}
              <li className={styles.total}>
                <span className={styles.meta} aria-hidden="true" />
                <span className={styles.what}>{t.total.text}</span>
                <span className={styles.meta}>{t.total.time}</span>
              </li>
            </ol>
          </div>
        </section>
      </main>

      <footer className={styles.foot}>
        <div className={styles.wrap}>
          <div className={styles.footGrid}>
            <div>
              <Brand lang={lang} logoClass={styles.footLogo} wordmarkClass={styles.footWordmark} />
              <p className={styles.tag}>{t.footTag}</p>
            </div>
            <nav aria-label={t.footLabel}>
              <ul className={styles.footList}>
                <li>
                  <a className={styles.footLink} href="#how">
                    {t.navHow}
                  </a>
                </li>
                <li>
                  <a className={styles.footLink} href="#tour">
                    {t.navTour}
                  </a>
                </li>
                <li>
                  <SoonButton className={`${styles.footLink} ${styles.soonLink}`} soon={t.soon}>
                    {t.footDemo}
                  </SoonButton>
                </li>
                <li>
                  <SoonButton className={`${styles.footLink} ${styles.soonLink}`} soon={t.soon}>
                    {t.signIn}
                  </SoonButton>
                </li>
              </ul>
            </nav>
          </div>
          <p className={styles.legal}>
            <span>{t.footCopy}</span>
            <span>{t.footLang}</span>
            <span>{t.footCredit}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
