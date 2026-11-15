import Link from "next/link";

import type { Lang } from "../../locales";
import { Logo } from "../../logo";
import { DemoButton, DemoNote } from "../demo-button";
import { HeadingText } from "../heading-text";
import styles from "../landing-page.module.css";
import { copy } from "./closing-band-copy";
import own from "./closing-band.module.css";

// The page ends on an inverted band: Ink on Paper, Paper on Ink. The tree stays Laterite on both.
export function ClosingBand({ lang }: { lang: Lang }) {
  const t = copy[lang];
  return (
    <section className={own.band} data-tile-bg="" aria-labelledby="closing-title">
      <div className={styles.wrap}>
        <div className={own.inner}>
          {/* The logo is never redrawn path by path (logo.md): it fades and rises once. */}
          <div className={`${own.logo} ${styles.reveal}`} data-reveal="">
            <Logo size={128} />
          </div>
          <h2 id="closing-title" className={own.title}>
            <HeadingText text={t.title} />
          </h2>
          <p className={own.text}>{t.text}</p>
          <div className={own.buttons}>
            <Link className={`${styles.btn} ${own.button}`} href={`/${lang}/sign-in`}>
              {t.ctaJoin}
            </Link>
            <DemoButton lang={lang} className={`${own.demo} ${own.button}`} note="closing-demo-note">
              {t.ctaDemo}
            </DemoButton>
          </div>
          <p className={own.note} id="closing-demo-note">
            <DemoNote lang={lang} />
          </p>
        </div>
      </div>
    </section>
  );
}
