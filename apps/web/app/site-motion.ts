// The visitor's choice to turn animations on even though their device asks for less motion.
// Two places read the device setting, and both go through here so the choice reaches them all:
//   - scripts ask `reducesMotion()` instead of reading the media query themselves;
//   - the style sheets' `prefers-reduced-motion` rules are switched off or on in the browser
//     (`followSiteMotion`), because a media query cannot be overridden from a class or attribute.
// A visitor who made no choice gets exactly what their device asks for.

export const SITE_MOTION_KEY = "vs-motion-site";
const REDUCE = "(prefers-reduced-motion: reduce)";
const CALM = "(prefers-reduced-motion: no-preference)";

const listeners = new Set<() => void>();
// the choice kept in memory when storage is blocked, so it still holds for the rest of the visit
let fallback = false;

export function siteMotionOn(): boolean {
  if (fallback) return true;
  try {
    return localStorage.getItem(SITE_MOTION_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSiteMotion(on: boolean) {
  try {
    if (on) localStorage.setItem(SITE_MOTION_KEY, "on");
    else localStorage.removeItem(SITE_MOTION_KEY);
    fallback = false;
  } catch {
    fallback = on;
  }
  listeners.forEach((notify) => notify());
}

// for the tests: a test is a visit of its own
export function forgetSiteMotion() {
  fallback = false;
}

// Whether the page should hold back its motion: the device asks for it and the visitor has not
// turned animations on.
export const reducesMotion = () => window.matchMedia(REDUCE).matches && !siteMotionOn();

type MediaRule = { media: { mediaText: string }; cssRules: ArrayLike<unknown> };
type Rules = { cssRules?: ArrayLike<unknown> };

const asked = new WeakMap<object, string>();

// Turns the motion rules of these style sheets off (or back to what the file says). A rule for
// "reduce" never matches while the visitor's choice is on, and one for "no-preference" always does.
export function applySiteMotion(sheets: Iterable<Rules>, on: boolean) {
  const walk = (rules: ArrayLike<unknown> | undefined) => {
    for (const rule of Array.from(rules ?? []) as Array<MediaRule & Rules>) {
      if (rule.media && typeof rule.media.mediaText === "string") {
        const written = asked.get(rule) ?? rule.media.mediaText;
        if (written.includes(REDUCE) || written.includes(CALM)) {
          asked.set(rule, written);
          rule.media.mediaText = !on ? written : written.includes(REDUCE) ? "not all" : written.replace(CALM, "(min-width: 0px)");
        }
      }
      walk(rule.cssRules);
    }
  };
  for (const sheet of sheets) {
    try {
      walk(sheet.cssRules);
    } catch {
      // a style sheet from another site cannot be read, and has no rules of ours
    }
  }
}

// Keeps the page's style sheets in step with the choice: now, when it changes (here or in
// another tab) and when a screen's style sheet arrives after the first load.
export function followSiteMotion(): () => void {
  const apply = () => applySiteMotion(Array.from(document.styleSheets), siteMotionOn());
  apply();
  listeners.add(apply);
  window.addEventListener("storage", apply);
  document.addEventListener("load", apply, true);
  const watch = new MutationObserver(apply);
  watch.observe(document.head, { childList: true });
  return () => {
    listeners.delete(apply);
    window.removeEventListener("storage", apply);
    document.removeEventListener("load", apply, true);
    watch.disconnect();
  };
}
