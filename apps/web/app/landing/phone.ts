// Below this width the landing is laid out for a phone: the same breakpoint as the page's CSS,
// which uses `max-width: 767px` for its phone rules.
export const PHONE_QUERY = "(max-width: 767px)";

export function isPhone(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(PHONE_QUERY).matches;
}

// calls `onChange` when the page crosses the breakpoint, as when a tablet turns
export function subscribePhone(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
