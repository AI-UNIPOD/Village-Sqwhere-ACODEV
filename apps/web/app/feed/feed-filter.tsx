"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import onboarding from "../onboarding/onboarding.module.css";
import { TECHNOLOGIES } from "../onboarding/options";
import { copy } from "./copy";
import { filterQuery, KINDS, type FeedFilter } from "./feed-api";
import styles from "./feed.module.css";

// The kind and the topic the address asks for. One the app does not know is left out, so a
// mistyped address shows the feed as it is instead of an error from the API. A hub's milestone
// is not a kind to choose: nobody writes one, and its text is not said in French yet.
export function readFilter(params: { get(name: string): string | null }): FeedFilter {
  const type = KINDS.find((kind) => kind === params.get("type"));
  const topic = TECHNOLOGIES.find((tech) => tech.slug === params.get("topic"))?.slug;
  return { type, topic };
}

// The feed's address with a kind, a topic, both or neither.
export function feedHref(lang: Lang, filter: FeedFilter = {}) {
  const query = filterQuery(filter);
  return `/${lang}/feed${query && `?${query}`}`;
}

// Above the posts: every kind as a link, so one can be chosen without finding a post of that
// kind first, and, when the address narrows the feed, a line that says to what, with the way
// back. A link only changes the address. Nothing is saved, so the demo account can use it too.
export function FeedFilters({ lang, filter }: { lang: Lang; filter: FeedFilter }) {
  const t = copy[lang].filter;
  const row = useRef<HTMLElement>(null);
  const topic = TECHNOLOGIES.find((tech) => tech.slug === filter.topic)?.name[lang];
  const what = [filter.type && t.kind[filter.type], topic && fill(t.topic, { name: topic })].filter(Boolean).join(", ");

  // on a phone the row scrolls sideways, and the chosen kind may be past its edge
  useEffect(() => {
    row.current?.querySelector("[aria-current]")?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [filter.type]);

  return (
    <div className={styles.filter}>
      <nav ref={row} className={styles.filterKinds} aria-label={t.kinds}>
        {[undefined, ...KINDS].map((kind) => (
          <Link
            key={kind ?? "all"}
            className={`${onboarding.chip} ${styles.filterKind}`}
            // choosing a kind keeps the topic
            href={feedHref(lang, { type: kind, topic: filter.topic })}
            aria-current={kind === filter.type ? "true" : undefined}
          >
            {kind ? t.kind[kind] : t.all}
          </Link>
        ))}
      </nav>
      {what && (
        <div className={styles.showing}>
          <p role="status">{fill(t.showing, { what })}</p>
          <Link className={landing.ghost} href={feedHref(lang)}>
            {t.clear}
          </Link>
        </div>
      )}
    </div>
  );
}
