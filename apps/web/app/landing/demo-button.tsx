"use client";

import type { ReactNode } from "react";

import type { Lang } from "../locales";
import { openDemo, useDemoOpening } from "../session/demo";
import { copy } from "./copy";

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
export function DemoNote({ lang, quiet }: { lang: Lang; quiet?: boolean }) {
  const t = copy[lang].demo;
  const opening = useDemoOpening();
  if (quiet && opening === "idle") return null;
  return <span aria-live="polite">{t[opening]}</span>;
}
