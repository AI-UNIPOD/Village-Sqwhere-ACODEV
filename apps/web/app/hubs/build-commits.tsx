"use client";

import type { ReactNode } from "react";

import { when } from "../feed/post-parts";
import ideas from "../ideas/ideas.module.css";
import landing from "../landing/landing-page.module.css";
import { fill } from "../onboarding/copy";
import { GithubLink, type Shared } from "./build-parts";
import { copy } from "./copy";
import { refreshCommits, type Build } from "./hubs-api";
import styles from "./hubs.module.css";

// The repository's latest commits, and for the people who may ask, the button that reads them
// again from GitHub. `said` is the status line.
export function Commits({ shared, build, linkable, now, said }: { shared: Shared; build: Build; linkable: boolean; now: number; said: ReactNode }) {
  const { lang, hubId, busy, send, apply } = shared;
  const c = copy[lang].buildTab.commits;
  // without a repository there is nothing to show but a line that says why the commits went
  if (!build.repository_url) return <>{said}</>;

  return (
    <section aria-labelledby="build-commits" className={styles.buildPart}>
      <h3 id="build-commits" className={styles.formTitle}>
        {c.heading}
      </h3>
      {build.commits_refreshed_at && (
        <p className={`${ideas.meta} ${styles.line}`}>{fill(c.checked, { when: when(build.commits_refreshed_at, now, lang) })}</p>
      )}
      {build.can_refresh && (
        <div className={styles.phaseActions}>
          <button
            type="button"
            className={landing.ghost}
            aria-busy={busy === "refresh" || undefined}
            aria-disabled={(!!busy && busy !== "refresh") || undefined}
            onClick={() =>
              send("refresh", async () => {
                apply(await refreshCommits(hubId));
                return { text: c.refreshed };
              })
            }
          >
            {c.refresh}
          </button>
        </div>
      )}
      {said}
      {build.commits.length === 0 ? (
        <p className={`${ideas.meta} ${styles.line}`}>{build.can_refresh ? c.empty : c.emptyAfter}</p>
      ) : (
        // the roles keep it a table in browsers that drop the meaning when the stacked layout changes the display
        <table className={styles.commits} role="table" aria-labelledby="build-commits">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">
                {c.what}
              </th>
              <th role="columnheader" scope="col">
                {c.who}
              </th>
              <th role="columnheader" scope="col">
                {c.when}
              </th>
              <th role="columnheader" scope="col">
                {c.commit}
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {build.commits.map((commit) => (
              <tr key={commit.sha} role="row">
                <td role="cell">{commit.message}</td>
                <td role="cell">{commit.author_name}</td>
                <td role="cell">
                  <time dateTime={commit.committed_at}>{when(commit.committed_at, now, lang)}</time>
                </td>
                <td role="cell">
                  <GithubLink lang={lang} href={`${build.repository_url}/commit/${encodeURIComponent(commit.sha)}`} linkable={linkable}>
                    {commit.sha.slice(0, 7)}
                  </GithubLink>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
