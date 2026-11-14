"use client";

import { useSyncExternalStore, type MouseEvent } from "react";

import { Tooltip } from "../tooltip";
import { parseSeconds } from "./gather";
import styles from "./landing-page.module.css";
import { THEME_KEY } from "./theme";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  system.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    system.removeEventListener("change", onChange);
  };
}

function currentTheme(): Theme {
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "dark" || chosen === "light") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // private mode: the choice still applies until the page is closed
  }
  listeners.forEach((notify) => notify());
}

type Transitioning = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

// The new theme spreads out from the button in a soft-edged circle until it covers the screen.
// With reduced motion nothing travels: a short crossfade, never an instant flip. Without view
// transitions it changes at once.
function toggle(event: MouseEvent<HTMLButtonElement>) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const doc = document as Transitioning;
  if (!doc.startViewTransition) {
    apply(next);
    return;
  }
  const root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    root.setAttribute("data-theme-fade", "");
    doc.startViewTransition(() => apply(next)).finished.finally(() => root.removeAttribute("data-theme-fade"));
    return;
  }
  const box = event.currentTarget.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  // globals.css turns off the default crossfade and draws the soft circle while this is set
  root.setAttribute("data-theme-spread", "");
  root.style.setProperty("--theme-x", `${x}px`);
  root.style.setProperty("--theme-y", `${y}px`);
  const transition = doc.startViewTransition(() => apply(next));
  transition.ready
    .then(() => {
      const style = getComputedStyle(root);
      // past the farthest corner by the width of the soft edge, so the old theme is fully gone
      const feather = 2 * (parseFloat(style.getPropertyValue("--space-20")) || 80);
      root.animate(
        { "--theme-reach": ["0px", `${Math.ceil(reach + feather)}px`] },
        {
          // the built CSS writes 520ms as .52s, so read the unit, not just the number
          duration: (parseSeconds(style.getPropertyValue("--dur-moment")) ?? 0.52) * 1000,
          easing: style.getPropertyValue("--ease-drawer").trim() || "ease-out",
          fill: "forwards",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => undefined);
  transition.finished.finally(() => {
    root.removeAttribute("data-theme-spread");
    root.style.removeProperty("--theme-x");
    root.style.removeProperty("--theme-y");
  });
}

type ThemeToggleProps = { toDark: string; toLight: string };

// A moon on Paper (go dark) and a sun on Ink (go light), turning into each other.
function ThemeIcons() {
  return (
    <>
      <svg className={styles.moon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
      </svg>
      <svg
        className={styles.sun}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
        <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
      </svg>
    </>
  );
}

// The theme switch, an icon button in a header: the caller's class places and sizes it.
export function ThemeButton({ toDark, toLight, className }: ThemeToggleProps & { className: string }) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={`${className} ${styles.mode} ${dark ? styles.dark : ""}`}
      aria-label={dark ? toLight : toDark}
      onClick={toggle}
    >
      <ThemeIcons />
      <Tooltip label={dark ? toLight : toDark} side="left" />
    </button>
  );
}
