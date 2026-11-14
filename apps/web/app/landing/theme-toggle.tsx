"use client";

import { useSyncExternalStore, type MouseEvent } from "react";

import { Tooltip } from "../tooltip";
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

// The new theme spreads out from the button in a circle until it covers the screen. Without view
// transitions, or with reduced motion, it changes at once.
function toggle(event: MouseEvent<HTMLButtonElement>) {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  const doc = document as Transitioning;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || still) {
    apply(next);
    return;
  }
  const box = event.currentTarget.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const reach = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const root = document.documentElement;
  // globals.css turns off the default crossfade while this attribute is set
  root.setAttribute("data-theme-spread", "");
  const transition = doc.startViewTransition(() => apply(next));
  transition.ready
    .then(() => {
      const style = getComputedStyle(root);
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
        {
          duration: parseFloat(style.getPropertyValue("--dur-drawer")) || 400,
          easing: style.getPropertyValue("--ease-out").trim() || "ease-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => undefined);
  transition.finished.finally(() => root.removeAttribute("data-theme-spread"));
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
