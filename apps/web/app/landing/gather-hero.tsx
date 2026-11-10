"use client";

import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

import { Logo } from "../logo";
import styles from "./gather-hero.module.css";
import { heroGeometry, isPhoneWidth } from "./hero-layout";

type GatherHeroProps = {
  /** The text block: headline, sentence and buttons. */
  children: ReactNode;
  labelledBy: string;
};

// The hero: text on one side and the 32 by 32 square the logo is drawn on. Where each sits is
// worked out from the width of the page, as in the approved B3v landing page, so the layout
// follows the screen continuously instead of jumping at breakpoints.
export function GatherHero({ children, labelledBy }: GatherHeroProps) {
  const hero = useRef<HTMLElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const tree = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const heroEl = hero.current;
    const copyEl = copy.current;
    const squareEl = square.current;
    const treeEl = tree.current;
    if (!heroEl || !copyEl || !squareEl || !treeEl) return;

    let lastWidth = -1;
    let lastViewportHeight = -1;

    function layout() {
      if (!heroEl || !copyEl || !squareEl || !treeEl) return;
      const width = heroEl.clientWidth;
      copyEl.classList.toggle(styles.center, isPhoneWidth(width));
      const g = heroGeometry({
        width,
        viewportHeight: window.innerHeight,
        navHeight: document.querySelector<HTMLElement>("[data-site-header]")?.offsetHeight ?? 0,
        measureCopy: (left, copyWidth) => {
          copyEl.style.left = `${left}px`;
          copyEl.style.width = `${copyWidth}px`;
          copyEl.style.maxWidth = "none";
          return copyEl.offsetHeight;
        },
      });
      copyEl.style.top = `${g.copyTop}px`;
      heroEl.style.height = `${g.height}px`;
      squareEl.style.cssText = `left:${g.x}px;top:${g.y}px;width:${g.square}px;height:${g.square}px;background-size:${g.cell}px ${g.cell}px`;
      treeEl.style.cssText = `left:${g.x}px;top:${g.y}px;width:${g.square}px;height:${g.square}px`;
      heroEl.setAttribute("data-ready", "");
      lastWidth = width;
      lastViewportHeight = window.innerHeight;
    }

    layout();

    const resize = new ResizeObserver(() => {
      if (heroEl.clientWidth !== lastWidth) layout();
    });
    resize.observe(heroEl);

    // on wide screens the hero fills the window, so a change of window height matters too
    function onWindowResize() {
      if (window.innerHeight !== lastViewportHeight && heroEl && heroEl.clientWidth >= 1200) {
        layout();
      }
    }
    window.addEventListener("resize", onWindowResize);

    // the web fonts change the height of the text, so place everything again once they load
    let active = true;
    document.fonts?.ready.then(() => {
      if (active) layout();
    });

    return () => {
      active = false;
      resize.disconnect();
      window.removeEventListener("resize", onWindowResize);
    };
  }, []);

  return (
    <section ref={hero} className={styles.hero} aria-labelledby={labelledBy}>
      <div ref={copy} className={styles.copy}>
        {children}
      </div>
      <div ref={square} className={styles.square} aria-hidden="true" />
      <div ref={tree} className={styles.tree} aria-hidden="true">
        <Logo size={32} className={styles.treeLogo} />
      </div>
    </section>
  );
}
