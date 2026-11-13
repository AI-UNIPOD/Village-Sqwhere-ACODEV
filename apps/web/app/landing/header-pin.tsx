"use client";

import { useEffect } from "react";

// The pill starts leaving a little before the header is back in view, so the two never overlap.
const RETURN_MARGIN = "80px 0px 0px 0px";

// Once the header has scrolled out of view, the same <header> turns into a floating pill
// (landing-page.module.css reads data-pinned); back at the top it turns into the header again.
// The slot around it holds the header's height while it is out of the flow, so the page does
// not jump. Without IntersectionObserver the header simply stays where it is.
export function HeaderPin() {
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
