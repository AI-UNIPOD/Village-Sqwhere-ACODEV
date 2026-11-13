import Link from "next/link";

import type { Lang } from "../locales";
import { copy } from "./copy";
import styles from "./ideas.module.css";

// The idea pages are siblings: everyone's open ideas, the ones that need you, and your own.
export function IdeasTabs({ lang, current }: { lang: Lang; current: "open" | "for-you" | "mine" }) {
  const t = copy[lang].browse;
  const tabs = [
    { id: "open", href: `/${lang}/ideas`, label: t.tabOpen },
    { id: "for-you", href: `/${lang}/ideas/for-you`, label: t.tabForYou },
    { id: "mine", href: `/${lang}/ideas/mine`, label: t.tabMine },
  ];
  return (
    <nav className={styles.tabs} aria-label={t.tabs}>
      {tabs.map((tab) => (
        <Link key={tab.id} className={styles.tab} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
