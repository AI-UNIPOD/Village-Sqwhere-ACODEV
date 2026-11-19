"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import onboarding from "../onboarding/onboarding.module.css";
import { TECHNOLOGIES } from "../onboarding/options";
import { copy } from "./copy";
import { filterQuery, KINDS, MAX_SEARCH_LENGTH, narrows, SORTS, startingSort, type FeedFilter, type Sort } from "./feed-api";
import styles from "./feed.module.css";

// The kind, the topic, the search words and the order the address asks for. One the app does not
// know is left out, so a mistyped address shows the feed as it is instead of an error from the
// API. A hub's milestone is not a kind to choose: nobody writes one, and its text is not said in
// French yet. Relevance only means something with search words, and the order a view starts with
// is not kept, so one address means one view.
export function readFilter(params: { get(name: string): string | null }): FeedFilter {
  const type = KINDS.find((kind) => kind === params.get("type"));
  const topic = TECHNOLOGIES.find((tech) => tech.slug === params.get("topic"))?.slug;
  const q = (params.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH).trim() || undefined;
  return tidy({ type, topic, q, sort: SORTS.find((sort) => sort === params.get("sort")) });
}

function tidy(filter: FeedFilter): FeedFilter {
  const { sort, ...rest } = filter;
  return sort && sort !== startingSort(filter) && (sort !== "relevance" || filter.q) ? { ...rest, sort } : rest;
}

// The feed's address with any of the four, in the words the request uses.
export function feedHref(lang: Lang, filter: FeedFilter = {}) {
  const query = filterQuery(tidy(filter));
  return `/${lang}/feed${query && `?${query}`}`;
}

// The orders on offer: the best match comes first with search words, the For you ranking without.
const orders = (filter: FeedFilter): Sort[] => [startingSort(filter), "newest", "active"];

// Search words in a box. Pressing the button, or Enter, only changes the address: nothing is
// saved, so the demo account can search too. Words that were typed and not sent are kept until
// the address changes: the box starts again from the address then (the key below).
function FeedSearch({ lang, filter }: { lang: Lang; filter: FeedFilter }) {
  const t = copy[lang].filter.search;
  const router = useRouter();
  const [typed, setTyped] = useState(filter.q ?? "");

  return (
    <form
      className={styles.search}
      role="search"
      aria-label={t.label}
      onSubmit={(event) => {
        event.preventDefault();
        const words = typed.trim().replace(/\s+/g, " ");
        // another search starts from its own best match, and a kind or a topic stays
        router.push(feedHref(lang, { ...filter, q: words || undefined, sort: undefined }));
      }}
    >
      <input
        className={`${onboarding.input} ${styles.searchBox}`}
        type="search"
        name="q"
        aria-label={t.label}
        placeholder={t.placeholder}
        maxLength={MAX_SEARCH_LENGTH}
        autoComplete="off"
        enterKeyHint="search"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
      <button type="submit" className={landing.ghost}>
        {t.button}
      </button>
    </form>
  );
}

// Above the posts: every kind as a link, so one can be chosen without finding a post of that
// kind first, and, when the address narrows the feed, a line that says to what, with the way
// back. A link only changes the address. Nothing is saved, so the demo account can use it too.
export function FeedFilters({ lang, filter }: { lang: Lang; filter: FeedFilter }) {
  const t = copy[lang].filter;
  const row = useRef<HTMLElement>(null);
  const topic = TECHNOLOGIES.find((tech) => tech.slug === filter.topic)?.name[lang];
  const what = [filter.q && fill(t.search.what, { q: filter.q }), filter.type && t.kind[filter.type], topic && fill(t.topic, { name: topic })]
    .filter(Boolean)
    .join(", ");
  const sort = filter.sort ?? startingSort(filter);

  // on a phone the row scrolls sideways, and the chosen kind may be past its edge
  useEffect(() => {
    row.current?.querySelector("[aria-current]")?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [filter.type]);

  return (
    <div className={styles.filter}>
      <FeedSearch key={filter.q ?? ""} lang={lang} filter={filter} />
      <nav ref={row} className={styles.filterKinds} aria-label={t.kinds}>
        {[undefined, ...KINDS].map((kind) => (
          <Link
            key={kind ?? "all"}
            className={`${onboarding.chip} ${styles.filterKind}`}
            // choosing a kind keeps the topic, the search words and the order
            href={feedHref(lang, { ...filter, type: kind })}
            aria-current={kind === filter.type ? "true" : undefined}
          >
            {kind ? t.kind[kind] : t.all}
          </Link>
        ))}
      </nav>
      <nav className={styles.sorts} aria-label={t.sort.label}>
        <span className={styles.sortLabel}>{t.sort.label}</span>
        {orders(filter).map((order) => (
          <Link
            key={order}
            className={`${onboarding.chip} ${styles.filterKind}`}
            // a new order keeps the kind, the topic and the search words
            href={feedHref(lang, { ...filter, sort: order })}
            aria-current={order === sort ? "true" : undefined}
          >
            {t.sort[order]}
          </Link>
        ))}
      </nav>
      <p className={styles.order}>{t.order[sort === "active" && filter.q ? "activeSearch" : sort]}</p>
      {narrows(filter) && what && (
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
