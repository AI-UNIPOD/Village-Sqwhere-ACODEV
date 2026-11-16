"use client";

import type { ReactNode } from "react";

import type { Lang } from "../locales";
import { openDemo, useDemoOpening } from "../session/demo";
import { copy } from "./copy";
import styles from "./landing-page.module.css";

// "Try the demo": signs in as the shared demo account, with no GitHub, and opens the village.
// `note` is the id of the line that reports on it; the hero places that line under this button.
// The guided tour starts from the demo's own bar, inside.
export function DemoButton({
  lang,
  className,
  note,
  children,
}: {
  lang: Lang;
  className: string;
  note?: string;
  children: ReactNode;
}) {
  const opening = useDemoOpening() === "opening";
  return (
    <button
      type="button"
      className={className}
      data-note={note}
      aria-busy={opening || undefined}
      aria-describedby={note}
      onClick={async () => {
        // a whole new page, as after signing in with GitHub: nothing kept from the visitor's page applies
        if (!(await openDemo())) return;
        window.location.replace(`/${lang}/village`);
      }}
    >
      {children}
    </button>
  );
}

// What the demo is, then how opening it is going. A screen reader hears it change. With `quiet`
// it says nothing until there is something to report (the copies of the button below the hero).
export function DemoNote({ lang, quiet, short }: { lang: Lang; quiet?: boolean; short?: boolean }) {
  const t = copy[lang].demo;
  const opening = useDemoOpening();
  if (quiet && opening === "idle") return null;
  // `short`: on a phone the line is cut to its first promise and wider screens read it whole.
  // Only the shown one counts (the other is display: none), so a screen reader hears what is seen.
  if (short && opening === "idle")
    return (
      <span aria-live="polite">
        <span className={styles.noteFull}>{t.idle}</span>
        <span className={styles.noteShort}>{t.idleShort}</span>
      </span>
    );
  return <span aria-live="polite">{t[opening]}</span>;
}
