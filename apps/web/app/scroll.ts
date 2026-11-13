// Scrolling to a named part of a screen, the way the design system moves: smooth, unless the
// person asked for less motion.
const behavior = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/**
 * Brings the part with this id to the top of the screen, just under a bar stuck there (the
 * guided tour's). The part and the bar are looked for in the frame around `from` only: screens
 * the app keeps in memory stay in the document, hidden, with the same ids.
 */
export function scrollToPart(from: Element, id: string) {
  const frame = from.closest("[data-frame]") ?? document.body;
  const part = [...frame.querySelectorAll<HTMLElement>("[id]")].find((el) => el.id === id);
  if (!part) return;
  const bar = frame.querySelector<HTMLElement>("[data-sticks-top]");
  const clear = (bar?.getBoundingClientRect().height ?? 0) + (parseFloat(getComputedStyle(part).scrollMarginTop) || 0);
  window.scrollTo({ top: part.getBoundingClientRect().top + window.scrollY - clear, behavior: behavior() });
}

// How long a page is given to finish arriving, and what the person does to say they have taken
// over the scrolling.
const SETTLE_MS = 3000;
const TAKEN_OVER = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Scrolls to the part with this id, and again each time `page` grows (a hub's team and brief
 * arrive after its card, pushing the rest down), until the person scrolls or presses something,
 * or the page has had a few seconds. Returns the way to stop.
 */
export function scrollToPartWhileSettling(page: Element, id: string) {
  const follow = new ResizeObserver(() => scrollToPart(page, id));
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
