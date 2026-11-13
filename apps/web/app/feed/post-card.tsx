import Link from "next/link";

import type { Lang } from "../locales";
import type { Post } from "./feed-api";
import styles from "./feed.module.css";
import { PostActions, PostBody, PostHead, PostLink, PostTopics } from "./post-parts";

// One post in a list: the whole of it except the end of a long body.
export function PostCard({ lang, post, now, onChange }: { lang: Lang; post: Post; now: number; onChange: (change: Partial<Post>) => void }) {
  const href = `/${lang}/posts/view?id=${encodeURIComponent(post.id)}`;
  return (
    <li className={styles.card}>
      <PostHead lang={lang} post={post} now={now} />
      {post.title && (
        <h2 className={styles.cardTitle}>
          <Link href={href}>{post.title}</Link>
        </h2>
      )}
      <PostBody post={post} clamp href={post.title ? undefined : href} />
      {post.link_url && <PostLink lang={lang} url={post.link_url} />}
      <PostTopics lang={lang} topics={post.topics} />
      <PostActions lang={lang} post={post} onChange={onChange} commentsHref={href} />
    </li>
  );
}
