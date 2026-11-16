"use client";

import Link from "next/link";
import { useState } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { fill } from "../onboarding/copy";
import { copy } from "./copy";
import { imageSrc, type PostImage } from "./feed-api";
import styles from "./feed.module.css";

// The most a card shows. The rest of a post's images are on its page.
const CARD_MAX = 4;

// A card's single image keeps its own shape, but a very tall one is cropped so it cannot fill the
// screen. A wide one is kept whole up to 6 to 1: a screenshot of code or a diagram is wide, and
// cropping its sides would cut away what it shows.
const ratioIn = (image: PostImage) => Math.min(Math.max(image.width / image.height, 0.8), 6);

// One image in a box that is its final size before the picture arrives, so the page does not
// jump. A picture that cannot load gives its box a line of text instead of a broken icon.
function Tile({ lang, image, index, total, href, more }: { lang: Lang; image: PostImage; index: number; total: number; href?: string; more?: number }) {
  const t = copy[lang].images;
  const [broken, setBroken] = useState(false);
  // in a card the link leads to the post; on the post's page it opens the image at full size
  const open = href ? { href } : { href: imageSrc(image), target: "_blank", rel: "noopener noreferrer" };
  const alt = fill(t.alt, { n: index + 1, total });
  const picture = broken ? (
    <span className={styles.imageBroken}>{t.broken}</span>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- the API serves the image as it was stored: there is no optimiser to send it through
    <img src={imageSrc(image)} alt={alt} width={image.width} height={image.height} loading="lazy" decoding="async" onError={() => setBroken(true)} />
  );
  const style = href && total > 1 ? undefined : { aspectRatio: href ? ratioIn(image) : image.width / image.height };
  const body = (
    <>
      {picture}
      {more !== undefined && (
        <span className={styles.imageMore}>
          <span aria-hidden="true">+{more}</span>
          <span className={landing.srOnly}>{fill(t.more, { n: more })}</span>
        </span>
      )}
      {!href && <span className={landing.srOnly}>({copy[lang].opensNewTab})</span>}
    </>
  );
  return (
    <li className={styles.image} style={style}>
      {href ? <Link {...open}>{body}</Link> : <a {...open}>{body}</a>}
    </li>
  );
}

// A post's images, in the order the API sends them. In a card (with `href`, the post's page) up
// to four show, the last with how many more there are; on the page every one shows.
export function PostImages({ lang, images, href }: { lang: Lang; images: PostImage[]; href?: string }) {
  if (images.length === 0) return null;
  const shown = href ? images.slice(0, CARD_MAX) : images;
  return (
    <ul className={styles.images} data-count={href ? shown.length : undefined}>
      {shown.map((image, index) => (
        <Tile
          key={image.id}
          lang={lang}
          image={image}
          index={index}
          total={images.length}
          href={href}
          more={href && index === CARD_MAX - 1 && images.length > CARD_MAX ? images.length - CARD_MAX : undefined}
        />
      ))}
    </ul>
  );
}
