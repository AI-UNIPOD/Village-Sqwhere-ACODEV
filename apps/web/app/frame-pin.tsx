"use client";

import { useEffect, useRef } from "react";

// The pill starts leaving a little before the header is back in view, so the two never overlap.
const RETURN_MARGIN = "80px 0px 0px 0px";

// The signed-in screens' version of landing/header-pin.tsx. Once the header has scrolled out of
// view, the same <header> turns into a floating pill (app-frame.module.css reads data-pinned);
// back at the top it turns into the header again. The slot around it holds the header's height
// while it is out of the flow, so the page does not jump. Without IntersectionObserver the
// header simply stays where it is. The refs, not the document, find the elements: screens kept
// in memory can be in the document at the same time.
export function useFramePin(enabled: boolean) {
  const slot = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const slotEl = slot.current;
    const headerEl = header.current;
    if (!enabled || !slotEl || !headerEl || !("IntersectionObserver" in window)) return;

    const unpin = () => {
      headerEl.removeAttribute("data-pinned");
      slotEl.style.minBlockSize = "";
    };
    // the fade-out is an animation on the header's own pill, not on the links inside it
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === headerEl && headerEl.getAttribute("data-pinned") === "leaving") unpin();
    };
    headerEl.addEventListener("animationend", onAnimationEnd);

    const observer = new IntersectionObserver(
      (entries) => {
        const inView = entries[entries.length - 1].isIntersecting;
        if (inView) {
          if (headerEl.hasAttribute("data-pinned")) headerEl.setAttribute("data-pinned", "leaving");
          return;
        }
        // measured while the header is still in the flow; a pinned one is shorter
        if (!headerEl.hasAttribute("data-pinned")) slotEl.style.minBlockSize = `${headerEl.offsetHeight}px`;
        headerEl.setAttribute("data-pinned", "");
      },
      { rootMargin: RETURN_MARGIN },
    );
    observer.observe(slotEl);

    return () => {
      observer.disconnect();
      headerEl.removeEventListener("animationend", onAnimationEnd);
      unpin();
    };
  }, [enabled]);

  return { slot, header };
}
