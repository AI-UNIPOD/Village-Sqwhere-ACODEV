"use client";

import { useSyncExternalStore } from "react";

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

function toggle() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // private mode: the choice still applies until the page is closed
  }
  listeners.forEach((notify) => notify());
}

type ThemeToggleProps = { toDark: string; toLight: string };

// A round button that shows a moon on Paper (go dark) and a sun on Ink (go light). Its label
// says what a tap does.
export function ThemeToggle({ toDark, toLight }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={`${styles.fab} ${styles.fabBottom} ${styles.mode} ${dark ? styles.dark : ""}`}
      aria-label={dark ? toLight : toDark}
      onClick={toggle}
    >
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
      <Tooltip label={dark ? toLight : toDark} side="left" />
    </button>
  );
}
