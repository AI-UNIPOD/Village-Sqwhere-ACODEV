"use client";

import { useEffect, useRef } from "react";

import ideas from "../ideas/ideas.module.css";
import { IdeaError } from "../ideas/ideas-api";
import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { AlertCircle } from "../onboarding/icons";
import onboarding from "../onboarding/onboarding.module.css";
import { copy } from "./copy";
import { IMAGE_LIMITS, imageSrc, type PostImage } from "./feed-api";
import styles from "./feed.module.css";
import { NotSaved } from "./not-saved";

type Text = (typeof copy)[Lang]["compose"]["images"];

// A file the person chose, with the address its thumbnail is drawn from.
export type Chosen = { key: number; file: File; url: string };

// Sorts what was picked into the files that can go up and a sentence for each that cannot, naming
// it. `room` is how many more images the post can take. The API checks the same rules again.
export function pickImages(files: File[], room: number, t: Text): { accepted: File[]; notes: string[] } {
  const accepted: File[] = [];
  const notes: string[] = [];
  for (const file of files) {
    const refused = !IMAGE_LIMITS.types.includes(file.type) ? "type" : file.size > IMAGE_LIMITS.maxBytes ? "size" : accepted.length >= room ? "count" : null;
    if (refused) notes.push(fill(t.refused[refused], { name: file.name }));
    else accepted.push(file);
  }
  return { accepted, notes };
}

// The sentence for an upload the API (or the network) refused.
export function uploadReason(error: unknown, name: string, t: Text): string {
  const key =
    !(error instanceof IdeaError) ? "other"
    : error.status === 413 ? "tooLarge"
    : error.status === 422 ? "invalid"
    : error.code === "POST_IMAGE_LIMIT" ? "limit"
    : error.code === "NOT_POST_AUTHOR" ? "notAuthor"
    : error.status === 404 ? "gone"
    : "other";
  return fill(t.reasons[key], { name });
}

type Props = {
  lang: Lang;
  /** The images already on the post (an edit). */
  existing: PostImage[];
  chosen: Chosen[];
  notes: string[];
  /** "Uploading image 2 of 3" while the files go up. */
  progress: string;
  busy: boolean;
  removing: string | null;
  /** "demo" when the API refused the removal for the demo account, else a sentence. */
  problem: string | null;
  onPick: (files: File[]) => void;
  onDrop: (key: number) => void;
  onRemove: (image: PostImage) => Promise<boolean>;
};

// "Add images" under the text: the files chosen so far with a thumbnail each, and on an edit the
// images the post already has.
export function ImagesField({ lang, existing, chosen, notes, progress, busy, removing, problem, onPick, onDrop, onRemove }: Props) {
  const t = copy[lang].compose.images;
  const add = useRef<HTMLInputElement>(null);
  // the id of the button that takes focus when the one that had it goes away, "" for the add button
  const next = useRef<string | null>(null);
  useEffect(() => {
    if (next.current === null) return;
    (document.getElementById(next.current) ?? add.current)?.focus();
    next.current = null;
  }, [existing.length, chosen.length]);

  // the remove buttons in the order they appear, so the neighbour of the one pressed can be named
  const buttons = [...existing.map((image) => `remove-image-${image.id}`), ...chosen.map((item) => `remove-file-${item.key}`)];
  const neighbour = (id: string) => buttons[buttons.indexOf(id) + 1] ?? buttons[buttons.indexOf(id) - 1] ?? "";

  return (
    <div className={ideas.field}>
      <p id="post-images-label" className={ideas.label}>
        {t.label} <span className={styles.optional}>({t.optional})</span>
      </p>
      {existing.length > 0 && (
        <ul className={styles.thumbs} aria-label={t.onPost}>
          {existing.map((image, index) => (
            <li key={image.id} className={styles.thumb}>
              {/* eslint-disable-next-line @next/next/no-img-element -- see PostImages */}
              <img
                src={imageSrc(image)}
                alt={fill(copy[lang].images.alt, { n: index + 1, total: existing.length })}
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
              />
              <span />
              <button
                type="button"
                id={`remove-image-${image.id}`}
                className={landing.ghost}
                aria-label={fill(t.removeOld, { n: index + 1 })}
                aria-busy={removing === image.id || undefined}
                disabled={busy}
                onClick={() => {
                  if (removing !== null) return;
                  next.current = neighbour(`remove-image-${image.id}`);
                  onRemove(image).then((gone) => {
                    // nothing left the list, so nothing needs the focus
                    if (!gone) next.current = null;
                  });
                }}
              >
                {t.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      {problem === "demo" ? (
        <NotSaved lang={lang} />
      ) : (
        problem && (
          <p className={onboarding.error} role="alert">
            <AlertCircle />
            {problem}
          </p>
        )
      )}
      {chosen.length > 0 && (
        <ul className={styles.thumbs}>
          {chosen.map((item) => (
            <li key={item.key} className={styles.thumb}>
              {/* a local preview: the name beside it says what it is */}
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob address cannot go through an optimiser */}
              <img src={item.url} alt="" />
              <span className={styles.thumbName}>{item.file.name}</span>
              <button
                type="button"
                id={`remove-file-${item.key}`}
                className={landing.ghost}
                aria-label={fill(t.removeNew, { name: item.file.name })}
                disabled={busy}
                onClick={() => {
                  next.current = neighbour(`remove-file-${item.key}`);
                  onDrop(item.key);
                }}
              >
                {t.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.picker}>
        <input
          ref={add}
          id="post-images"
          className={landing.srOnly}
          type="file"
          accept={IMAGE_LIMITS.types.join(",")}
          multiple
          disabled={busy}
          aria-describedby="post-images-help"
          onChange={(event) => {
            onPick(Array.from(event.target.files ?? []));
            // so choosing the same file again, after removing it, is noticed
            event.target.value = "";
          }}
        />
        <label htmlFor="post-images" className={landing.ghost}>
          {t.add}
        </label>
      </div>
      <p id="post-images-help" className={ideas.help}>
        {t.help}
      </p>
      {notes.map((note) => (
        <p key={note} className={onboarding.error} role="alert">
          <AlertCircle />
          {note}
        </p>
      ))}
      <p className={`${ideas.help} ${styles.status}`} role="status">
        {progress}
      </p>
    </div>
  );
}
