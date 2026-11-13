import Link from "next/link";
import type { CSSProperties } from "react";

import type { Lang } from "../locales";
import { Logo } from "../logo";
import { AccountNavLink } from "../session/session-ui";
import { Tooltip } from "../tooltip";
import { copy } from "./copy";
import { DemoButton, DemoNote } from "./demo-button";
import { GatherHero } from "./gather-hero";
import { HeaderPin } from "./header-pin";
import styles from "./landing-page.module.css";
import { SectionMotion } from "./section-motion";
import { stopShares } from "./stops";
import { ThemeToggle } from "./theme-toggle";

// custom properties for the stagger: the item's place in its row of 2 or 4, or in its list
const order = (vars: Record<string, number>) => vars as CSSProperties;

// translate="no": browser translation turned the name into "Village Square".
function Brand({ lang, logoClass, wordmarkClass }: { lang: Lang; logoClass: string; wordmarkClass: string }) {
  return (
    <Link className={styles.brand} href={`/${lang}`}>
      <Logo size={32} className={logoClass} />
      <span className={wordmarkClass} translate="no">Village Sqwhere</span>
    </Link>
  );
}

export function LandingPage({ lang }: { lang: Lang }) {
  const t = copy[lang];
  const other: Lang = lang === "en" ? "fr" : "en";
  const shares = stopShares(
    t.stops.map((stop) => stop.time),
    t.total.time,
  );

  return (
    <div>
      {/* The slot keeps the header's place while HeaderPin turns it into a pill, and is what the
          hero measures: a pinned header is shorter than the one in the flow. */}
      <div data-site-header="" data-header-slot="">
        <header className={styles.nav}>
          <Brand lang={lang} logoClass={styles.navLogo} wordmarkClass={styles.navWordmark} />
          <nav className={styles.navLinks} aria-label={t.navLabel}>
            <a className={styles.navLink} href="#how">
              {t.navHow}
            </a>
            <a className={styles.navLink} href="#tour">
              {t.navTour}
            </a>
            <AccountNavLink lang={lang} signIn={t.signIn} signOut={t.signOut} className={styles.navLink} />
          </nav>
        </header>
      </div>

      {/* A plain link on purpose: a full page load. A client navigation keeps the old language
          hidden in the page and makes React drop the theme set on <html>. translate="no" stops
          browser translation turning "EN" into "IN". */}
      <a
        className={`${styles.fab} ${styles.fabTop}`}
        href={`/${other}`}
        hrefLang={other}
        lang={other}
        translate="no"
        aria-label={t.switchLabel}
      >
        {t.switchText}
        <Tooltip label={t.switchLabel} side="left" />
      </a>
      <ThemeToggle toDark={t.toDark} toLight={t.toLight} />

      <main>
        <GatherHero labelledBy="hero-title" labels={{ pause: t.pause, play: t.play }}>
          <h1 id="hero-title">{t.headline}</h1>
          <p className={styles.sub}>{t.sub}</p>
          <div className={styles.ctas}>
            <Link className={`${styles.btn} ${styles.heroButton}`} href={`/${lang}/sign-in`}>
              {t.ctaJoin}
            </Link>
            <a className={`${styles.ghost} ${styles.heroButton}`} href="#tour">
              {t.ctaTour}
            </a>
            <DemoButton lang={lang} className={`${styles.ghost} ${styles.heroButton}`} note="demo-note">
              {t.ctaDemo}
            </DemoButton>
          </div>
          {/* what the demo is, then how opening it is going */}
          <p className={styles.note} id="demo-note" data-hero-note="">
            <DemoNote lang={lang} />
          </p>
        </GatherHero>

        <section className={styles.block} id="how" aria-labelledby="how-title">
          <div className={styles.wrap}>
            <h2 id="how-title">{t.howTitle}</h2>
            <p className={styles.lead}>{t.howLead}</p>
            <ol className={styles.steps}>
              {t.steps.map((step, i) => (
                <li
                  className={`${styles.step} ${styles.reveal}`}
                  key={step.title}
                  data-reveal=""
                  style={order({ "--i2": i % 2, "--i4": i % 4 })}
                >
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
              <div className={styles.tourButton}>
                {/* the demo, opened on the tour's first step */}
                <DemoButton lang={lang} className={styles.ghost} note="tour-note" tour>
                  {t.tourButton}
                </DemoButton>
                <p className={styles.tourNote} id="tour-note">
                  <DemoNote lang={lang} quiet />
                </p>
              </div>
            </div>
            <ol className={styles.stops}>
              {t.stops.map((stop, i) => (
                <li key={stop.text} className={styles.reveal} data-reveal="" style={order({ "--i": i })}>
                  <span className={styles.meta} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.what}>{stop.text}</span>
                  <span className={styles.meta}>{stop.time}</span>
                  <span
                    className={styles.bar}
                    aria-hidden="true"
                    style={order({ "--from": shares[i].from, "--size": shares[i].size })}
                  />
                </li>
              ))}
              <li
                className={`${styles.total} ${styles.reveal}`}
                data-reveal=""
                style={order({ "--i": t.stops.length })}
              >
                <span className={styles.meta} aria-hidden="true" />
                <span className={styles.what}>{t.total.text}</span>
                <span className={styles.meta}>{t.total.time}</span>
                <span className={styles.bar} aria-hidden="true" style={order({ "--from": 0, "--size": 1 })} />
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
                  <DemoButton lang={lang} className={styles.footLink}>
                    {t.footDemo}
                  </DemoButton>
                  <DemoNote lang={lang} quiet />
                </li>
                <li>
                  <Link className={styles.footLink} href={`/${lang}/sign-in`}>
                    {t.signIn}
                  </Link>
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

      <SectionMotion />
      <HeaderPin />
    </div>
  );
}
