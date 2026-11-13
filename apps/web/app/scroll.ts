// Scrolling the way the design system moves: smooth, unless the person asked for less motion.
const behavior = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** Brings the element with this id to the middle of the screen, clear of a bar stuck to its top. */
export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: "center", behavior: behavior() });
}

export const scrollToTop = () => window.scrollTo({ top: 0, behavior: behavior() });
