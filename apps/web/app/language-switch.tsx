"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent } from "react";

import { LANGUAGE_NAMES, LOCALES, type Lang } from "./locales";
import styles from "./language-switch.module.css";

type LanguageSwitchProps = {
  lang: Lang;
  /** The address after the language, so the switch opens the same screen: "" for the landing page. */
  path: string;
};

/**
 * EN and FR side by side, the page's language on a dark thumb. The other one is a plain link on
 * purpose (a full page load): a client navigation kept the old language hidden in the page and
 * dropped the theme set on <html>. Pressing it slides the thumb across while the page loads, and
 * on hover the thumb leans towards it. Each language is named in its own words. translate="no" stops browser translation turning "EN"
 * into "IN".
 */
export function LanguageSwitch({ lang, path }: LanguageSwitchProps) {
  const [going, setGoing] = useState(false);
  const at = LOCALES.indexOf(lang);

  // Back from the other language, the browser may restore this page as it was left: mid-switch.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => event.persisted && setGoing(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  // A press that opens a new tab leaves this page where it is.
  function press(event: MouseEvent) {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) setGoing(true);
  }
  return (
    <div
      className={styles.switch}
      data-language-switch=""
      translate="no"
      data-going={going || undefined}
      style={{ "--at": at } as CSSProperties}
    >
      <span className={styles.thumb} aria-hidden="true" />
      {LOCALES.map((code) =>
        code === lang ? (
          <span key={code} className={styles.option} aria-current="true" lang={code}>
            <span aria-hidden="true">{code.toUpperCase()}</span>
            <span className={styles.srOnly}>{LANGUAGE_NAMES[code]}</span>
          </span>
        ) : (
          <a
            key={code}
            className={styles.option}
            href={`/${code}${path ? `/${path}` : ""}`}
            hrefLang={code}
            lang={code}
            aria-label={LANGUAGE_NAMES[code]}
            onClick={press}
          >
            {code.toUpperCase()}
          </a>
        ),
      )}
    </div>
  );
}
