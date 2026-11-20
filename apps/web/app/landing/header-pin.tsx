"use client";

import { useEffect } from "react";

// The pill starts leaving a little before the header is back in view, so the two never overlap.
const RETURN_MARGIN = "80px 0px 0px 0px";
// Past this share of its way out with the footer, the pill counts as away: with reduced motion
// it is simply hidden from there instead of sliding.
const AWAY = 0.5;

// Once the header has scrolled out of view, the same <header> turns into a floating pill
// (landing-page.module.css reads data-pinned); back at the top it turns into the header again.
// The slot around it holds the header's height while it is out of the flow, so the page does
// not jump. Without IntersectionObserver the header simply stays where it is.
export function HeaderPin() {
  // Near the end of the page the pill leaves with the footer, tied to the scroll: --leave runs
  // from 0, as the footer's top edge comes into view, to 1, once as much of the footer is in view
  // as can be (all of it, or a screen of it), and the stylesheet slides the pill up and out by
  // that share. Scrolling back brings it back the same way.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-header-slot] header");
    const footer = document.querySelector<HTMLElement>("footer");
    if (!header || !footer) return;
    let frame = 0;
    const follow = () => {
      frame = 0;
      const box = footer.getBoundingClientRect();
      const screen = window.innerHeight;
      const leave = Math.min(1, Math.max(0, (screen - box.top) / Math.max(1, Math.min(box.height, screen))));
      header.style.setProperty("--leave", leave.toFixed(3));
      header.toggleAttribute("data-away", leave >= AWAY);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(follow);
    };
    follow();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      header.style.removeProperty("--leave");
      header.removeAttribute("data-away");
    };
  }, []);

  useEffect(() => {
    const slot = document.querySelector<HTMLElement>("[data-header-slot]");
    const header = slot?.querySelector<HTMLElement>("header");
    if (!slot || !header || !("IntersectionObserver" in window)) return;

    const unpin = () => {
      header.removeAttribute("data-pinned");
      slot.style.minBlockSize = "";
    };
    // the fade-out is an animation on the header itself, not on the links inside it
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === header && header.getAttribute("data-pinned") === "leaving") unpin();
    };
    header.addEventListener("animationend", onAnimationEnd);

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries[entries.length - 1].isIntersecting;
        if (inView) {
          if (header.hasAttribute("data-pinned")) header.setAttribute("data-pinned", "leaving");
          return;
        }
        // measured while the header is still in the flow; a pinned one is shorter
        if (!header.hasAttribute("data-pinned")) slot.style.minBlockSize = `${header.offsetHeight}px`;
        header.setAttribute("data-pinned", "");
      },
      { rootMargin: RETURN_MARGIN },
    );
    observer.observe(slot);

    return () => {
      observer.disconnect();
      header.removeEventListener("animationend", onAnimationEnd);
      unpin();
    };
  }, []);

  return null;
}
