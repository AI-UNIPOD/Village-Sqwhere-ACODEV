"use client";

import { useEffect } from "react";

// An item counts as in view once 15% of it shows above the bottom 8% of the screen
// (docs/design-system/components.md, Motion).
const REVEAL_THRESHOLD = 0.15;
const REVEAL_MARGIN = "0px 0px -8% 0px";
// A section is "the one you are reading" while it crosses a thin band just above the middle.
const READING_BAND = "-45% 0px -50% 0px";
// When most of the footer shows, the page cannot scroll further: the last section is the one.
const END_IN_VIEW = 0.9;

// The interactions of the landing sections. The page is drawn on the server; this adds, once
// it runs in the browser:
// - reveals: items marked data-reveal rise into place the first time they scroll into view.
//   Only items below the screen at load wait; without JavaScript nothing is ever hidden.
// - the header link of the section in view is marked with aria-current="location".
export function SectionMotion() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if ("IntersectionObserver" in window) {
      const waiting = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
        (el) => el.getBoundingClientRect().top > window.innerHeight,
      );
      if (waiting.length > 0) {
        const reveal = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              entry.target.setAttribute("data-reveal", "shown");
              reveal.unobserve(entry.target);
            }
          },
          { threshold: REVEAL_THRESHOLD, rootMargin: REVEAL_MARGIN },
        );
        for (const el of waiting) {
          el.setAttribute("data-reveal", "waiting");
          reveal.observe(el);
        }
        cleanups.push(() => reveal.disconnect());
      }

      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('header nav a[href^="#"]'),
      );
      const sections = links
        .map((link) => document.getElementById(link.hash.slice(1)))
        .filter((el): el is HTMLElement => el != null);
      if (sections.length > 0) {
        const reading = new Set<string>();
        let atEnd = false;
        const mark = () => {
          // on a tall screen the band never reaches the last section, so the end of the page
          // decides; otherwise the last section crossing the band
          const current = atEnd
            ? sections[sections.length - 1].id
            : [...sections].reverse().find((s) => reading.has(s.id))?.id;
          for (const link of links) {
            if (link.hash.slice(1) === current) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          }
        };
        const spy = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) reading.add(entry.target.id);
              else reading.delete(entry.target.id);
            }
            mark();
          },
          { rootMargin: READING_BAND },
        );
        for (const section of sections) spy.observe(section);
        cleanups.push(() => spy.disconnect());

        const footer = document.querySelector("footer");
        if (footer) {
          const end = new IntersectionObserver(
            (entries) => {
              atEnd = entries[entries.length - 1].isIntersecting;
              mark();
            },
            { threshold: END_IN_VIEW },
          );
          end.observe(footer);
          cleanups.push(() => end.disconnect());
        }
      }
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  return null;
}
