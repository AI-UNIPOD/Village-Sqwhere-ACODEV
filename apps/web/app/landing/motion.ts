// Whether the hero moves. One rule, no second mode:
//   moving = the visitor chose "on", or they chose nothing and the system does not ask for
//   reduced motion.
// So reduced motion is respected until the visitor says otherwise, and a choice they made wins
// over the system setting. Without a choice, a change of the system setting is followed.

export const MOTION_KEY = "vs-motion";

type Choice = "on" | "off";

const listeners = new Set<() => void>();
// the choice kept in memory when storage is blocked, so a click still works while the hero is shown
let fallback: Choice | null = null;

function stored(): Choice | null {
  if (fallback) return fallback;
  try {
    const value = localStorage.getItem(MOTION_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

export function motionOn(): boolean {
  const choice = stored();
  if (choice) return choice === "on";
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setMotion(on: boolean) {
  const choice: Choice = on ? "on" : "off";
  try {
    localStorage.setItem(MOTION_KEY, choice);
    fallback = null;
  } catch {
    fallback = choice;
  }
  listeners.forEach((notify) => notify());
}

// calls `onChange` when the choice changes here, in another tab, or when the system setting does
export function subscribeMotion(onChange: () => void) {
  listeners.add(onChange);
  const system = window.matchMedia("(prefers-reduced-motion: reduce)");
  system.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    system.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
    if (!listeners.size) fallback = null;
  };
}
