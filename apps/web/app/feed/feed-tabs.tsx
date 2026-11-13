import Link from "next/link";

import ideas from "../ideas/ideas.module.css";
import type { Lang } from "../locales";
import { copy } from "./copy";

export type Tab = "for-you" | "saved" | "mine";

// The three lists of posts are siblings, in the style of the ideas tabs.
export function FeedTabs({ lang, current }: { lang: Lang; current: Tab }) {
  const t = copy[lang];
  const tabs = [
    { id: "for-you", href: `/${lang}/feed`, label: t.tabForYou },
    { id: "saved", href: `/${lang}/feed/saved`, label: t.tabSaved },
    { id: "mine", href: `/${lang}/feed/mine`, label: t.tabMine },
  ];
  return (
    <nav className={ideas.tabs} aria-label={t.tabs}>
      {tabs.map((tab) => (
        <Link key={tab.id} className={ideas.tab} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
