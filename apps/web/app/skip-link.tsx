"use client";

import type { Lang } from "./locales";
import styles from "./skip-link.module.css";
import { copy } from "./skip-link-copy";

// Lets a keyboard user jump past the header and its links to the page's <main>. The pages do not
// share one id for it, so the link finds the element and moves focus there itself.
export function SkipLink({ lang }: { lang: Lang }) {
  return (
    <a
      className={styles.link}
      href="#"
      onClick={(event) => {
        const main = document.querySelector("main");
        if (!main) return;
        event.preventDefault();
        main.tabIndex = -1;
        main.focus();
      }}
    >
      {copy[lang].skip}
    </a>
  );
}
