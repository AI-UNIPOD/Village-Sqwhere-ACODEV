"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { Lang } from "../locales";
import { Lightbulb } from "../onboarding/icons";
import { copy } from "./copy";
import { loadSimilarIdeas, type PublicIdea, type SimilarIdea } from "./ideas-api";
import styles from "./ideas.module.css";

// The line on a match that has a similar idea. `yours` is the signed-in developer's own idea,
// which opens where they manage it; the other developer's opens as everyone sees it. The title
// is plain text inside the link.
export function SimilarIdeaLine({ lang, idea, yours }: { lang: Lang; idea: SimilarIdea; yours?: boolean }) {
  const t = copy[lang].similar;
  const [before, after] = (yours ? t.yours : t.theirs).split("{title}");
  const href = yours ? `/${lang}/ideas/compose?id=${encodeURIComponent(idea.id)}` : `/${lang}/ideas/view?id=${encodeURIComponent(idea.id)}`;
  return (
    <p className={styles.fit}>
      <Lightbulb />
      <span>
        {before}
        <Link href={href}>{idea.title}</Link>
        {after}
      </span>
    </p>
  );
}

// Open ideas that read close to this one: an extra under the idea, so it shows nothing until it
// has something, and nothing when the read fails. No number comes with them.
export function SimilarIdeas({ lang, id }: { lang: Lang; id: string }) {
  const t = copy[lang];
  const [ideas, setIdeas] = useState<PublicIdea[]>([]);

  useEffect(() => {
    let live = true;
    loadSimilarIdeas(id)
      // the API sends at most five, and the page keeps to that
      .then((found) => live && setIdeas(found.slice(0, 5)))
      .catch(() => live && setIdeas([]));
    return () => {
      live = false;
    };
  }, [id]);

  if (ideas.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="similar-ideas">
      <h2 id="similar-ideas" className={styles.heading}>
        {t.similar.heading}
      </h2>
      <ul className={styles.list}>
        {ideas.map((idea) => (
          <li key={idea.id} className={styles.card}>
            <h3 className={styles.cardTitle}>
              <Link href={`/${lang}/ideas/view?id=${encodeURIComponent(idea.id)}`}>{idea.title}</Link>
            </h3>
            <p className={styles.summary}>{idea.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
