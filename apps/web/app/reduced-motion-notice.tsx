"use client";

import { useEffect, useSyncExternalStore } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import type { Lang } from "./locales";
import { copy } from "./reduced-motion-notice-copy";
import { followSiteMotion, setSiteMotion } from "./site-motion";

export const NOTICE_KEY = "vs-motion-notice";
const QUERY = "(prefers-reduced-motion: reduce)";

const listeners = new Set<() => void>();
// kept here when storage is blocked, so the notice is not repeated on every page of the visit
let seenHere = false;

// for the tests: a test is a visit of its own
export function forgetNotice() {
  seenHere = false;
}

function seen(): boolean {
  if (seenHere) return true;
  try {
    return localStorage.getItem(NOTICE_KEY) === "seen";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(NOTICE_KEY, "seen");
  } catch {
    // private mode: it stays dismissed until the page is closed
    seenHere = true;
  }
  listeners.forEach((notify) => notify());
}

// the system setting can change with the page open, and another tab can dismiss the notice
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const system = window.matchMedia(QUERY);
  system.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    system.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

const shouldShow = () => window.matchMedia(QUERY).matches && !seen();

// Tells a visitor whose device asks for reduced motion that the site moves less, once, and
// lets them turn animations on. It reuses the confirm dialog: a native <dialog>, so focus is held
// inside it, Escape closes it and focus goes back to where it was. "Turn animations on" keeps the
// choice (site-motion.ts) and reloads, so every screen starts again with its motion; the other
// button and Escape keep things toned down. Both count as seen. It never animates, and it goes
// away by itself if the device setting is turned off while it is open.
export function ReducedMotionNotice({ lang }: { lang: Lang }) {
  // the server and the first render say "no": the setting is only known in the browser
  const open = useSyncExternalStore(subscribe, shouldShow, () => false);
  // always mounted, so this is also where the style sheets follow the visitor's choice
  useEffect(followSiteMotion, []);
  const t = copy[lang];
  return (
    <ConfirmDialog
      open={open}
      still
      title={t.title}
      confirm={t.turnOn}
      cancel={t.keep}
      onConfirm={() => {
        setSiteMotion(true);
        markSeen();
        window.location.reload();
      }}
      onCancel={markSeen}
    >
      <p>{t.text}</p>
    </ConfirmDialog>
  );
}
