// Scrolling the way the design system moves: smooth, unless the person asked for less motion.
const behavior = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** Brings the element with this id to the middle of the screen, clear of a bar stuck to its top. */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "center", behavior: behavior() });
}

export const scrollToTop = () => window.scrollTo({ top: 0, behavior: behavior() });

// How long a page is given to finish arriving, and what the person does to say they have taken
// over the scrolling.
const SETTLE_MS = 3000;
const TAKEN_OVER = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Scrolls to the element with this id, and again each time `page` grows (a hub's team and brief
 * arrive after its card, pushing the rest down), until the person scrolls or presses something,
 * or the page has had a few seconds. Returns the way to stop.
 */
export function scrollToIdWhileSettling(id: string, page: Element) {
  const follow = new ResizeObserver(() => scrollToId(id));
  const stop = () => {
    follow.disconnect();
    clearTimeout(timer);
    for (const event of TAKEN_OVER) window.removeEventListener(event, stop);
  };
  const timer = setTimeout(stop, SETTLE_MS);
  for (const event of TAKEN_OVER) window.addEventListener(event, stop, { passive: true });
  // an observer reports the page's size as soon as it starts, which is the first scroll
  follow.observe(page);
  return stop;
}
