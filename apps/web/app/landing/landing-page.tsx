import Link from "next/link";

import type { Lang } from "../locales";
import { Logo } from "../logo";
import { AccountNavLink } from "../session/session-ui";
import { copy } from "./copy";
import { DemoButton, DemoNote } from "./demo-button";
import { GatherHero } from "./gather-hero";
import { HeaderPin } from "./header-pin";
import styles from "./landing-page.module.css";
import { SectionMotion } from "./section-motion";
import { HeaderTools } from "./header-tools";
import { ClosingBand } from "./sections/closing-band";
import { Faq } from "./sections/faq";
import { GreenTick } from "./sections/green-tick";
import { HowItWorks } from "./sections/how-it-works";
import { HubPhases } from "./sections/hub-phases";
import { MatcherDemo } from "./sections/matcher-demo";
import { Principles } from "./sections/principles";

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
  const sections = [
    ["#matcher", t.navMatcher],
    ["#hub", t.navHub],
    ["#faq", t.navFaq],
  ] as const;

  return (
    <div className={styles.landing}>
      {/* The slot keeps the header's place while HeaderPin turns it into a pill, and is what the
          hero measures: a pinned header is shorter than the one in the flow. */}
      <div data-site-header="" data-header-slot="">
        <header className={styles.nav}>
          <Brand lang={lang} logoClass={styles.navLogo} wordmarkClass={styles.navWordmark} />
          <nav className={styles.navLinks} aria-label={t.navLabel}>
            {sections.map(([href, label]) => (
              <a key={href} className={styles.navLink} href={href}>
                {label}
              </a>
            ))}
            <AccountNavLink lang={lang} signIn={t.signIn} signOut={t.signOut} className={styles.navLink} />
          </nav>
          <HeaderTools lang={lang} path="" />
        </header>
      </div>

      <main>
        <GatherHero labelledBy="hero-title" labels={{ pause: t.pause, play: t.play }}>
          <h1 id="hero-title">{t.headline}</h1>
          <p className={styles.sub}>{t.sub}</p>
          <div className={styles.ctas}>
            <Link className={`${styles.btn} ${styles.heroButton}`} href={`/${lang}/sign-in`}>
              {t.ctaJoin}
            </Link>
            <DemoButton lang={lang} className={`${styles.ghost} ${styles.heroButton}`} note="demo-note">
              {t.ctaDemo}
            </DemoButton>
          </div>
          {/* what the demo is, then how opening it is going */}
          <p className={styles.note} id="demo-note" data-hero-note="">
            <DemoNote lang={lang} />
          </p>
        </GatherHero>

        <MatcherDemo lang={lang} />
        <HowItWorks lang={lang} />
        <HubPhases lang={lang} />
        <GreenTick lang={lang} />
        <Principles lang={lang} />
        <Faq lang={lang} />
        <ClosingBand lang={lang} />
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
                {sections.map(([href, label]) => (
                  <li key={href}>
                    <a className={styles.footLink} href={href}>
                      {label}
                    </a>
                  </li>
                ))}
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
            <span>{t.footMadeUp}</span>
            <span>{t.footCredit}</span>
          </p>
        </div>
      </footer>

      <SectionMotion />
      <HeaderPin />
    </div>
  );
}
