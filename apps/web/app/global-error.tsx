"use client";

import { FONT_CLASSES } from "./fonts";
import "./globals.css";
import landing from "./landing/landing-page.module.css";
import { THEME_INIT_SCRIPT } from "./landing/theme";
import { LOCALES } from "./locales";
import { copy } from "./page-error/copy";
import styles from "./page-error/error-page.module.css";

// Catches an error in the root layout itself, which [lang]/error.tsx cannot: this file replaces
// the layout, so it brings its own document, fonts and theme. The layout's language is not known
// here, so each language says it once.
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en" className={FONT_CLASSES} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <main className={styles.main}>
          {LOCALES.map((lang, index) => {
            const Heading = index === 0 ? "h1" : "h2";
            return (
              <section key={lang} lang={lang}>
                <Heading className={styles.title}>{copy[lang].heading}</Heading>
                <p className={styles.text}>{copy[lang].text}</p>
                <div className={styles.actions}>
                  <button type="button" className={landing.btn} onClick={retry}>
                    {copy[lang].retry}
                  </button>
                </div>
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
