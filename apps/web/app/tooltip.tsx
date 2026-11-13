"use client";

import { useEffect, useRef } from "react";

import styles from "./tooltip.module.css";

type TooltipProps = {
  /** What the button does, in the page's language. The same words as the button's aria-label. */
  label: string;
  /** Where it sits: left of the button, or under it. */
  side?: "left" | "below";
};

// How soon after one tooltip closes the next one opens at once, with no wait and no fade, so
// moving along a row of buttons feels quick.
const QUICK_MS = 500;
let closedAt = -Infinity;

/**
 * A tooltip for an icon button (docs/design-system/components.md, Icon buttons). Put it inside
 * the button or link it names: it watches its parent. It opens on a mouse over, after a wait, and
 * at once on keyboard focus. A finger never opens it, so a tap cannot leave it stuck on. Escape
 * closes it, and the pointer can move onto it without it closing.
 *
 * The button keeps its own aria-label, so the tooltip is hidden from screen readers: they would
 * read the same words twice. This only decides when it shows. The stylesheet does the timing
 * and the motion, from the data attributes it sets: data-open, data-wait, data-instant and,
 * for a tooltip under its button, data-flip when it would fall off the bottom of the screen.
 */
export function Tooltip({ label, side = "left" }: TooltipProps) {
  const tip = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bubble = tip.current;
    const host = bubble?.parentElement;
    if (!bubble || !host) return;

    let hovering = false;
    let focused = false;
    let dismissed = false;
    let instant = false;

    // A tooltip under a button near the bottom of the screen would fall off it, and a pause
    // button sits there on a phone. If so, and there is room above, it goes above instead.
    function place() {
      if (side !== "below") return;
      bubble!.removeAttribute("data-flip");
      const at = host!.getBoundingClientRect();
      const tip = bubble!.getBoundingClientRect();
      const needed = tip.height + (tip.top - at.bottom); // the tooltip and its gap
      bubble!.toggleAttribute("data-flip", tip.bottom > window.innerHeight && at.top >= needed);
    }

    function show() {
      const wanted = (hovering || focused) && !dismissed;
      const open = bubble!.hasAttribute("data-open");
      if (wanted && !open) {
        instant = performance.now() - closedAt < QUICK_MS;
        bubble!.toggleAttribute("data-instant", instant);
        place();
        bubble!.setAttribute("data-open", "");
        document.addEventListener("keydown", onKey);
      } else if (!wanted && open) {
        bubble!.removeAttribute("data-open");
        closedAt = performance.now();
        document.removeEventListener("keydown", onKey);
      }
      // only a mouse waits: the keyboard and a quick follow-up do not
      bubble!.toggleAttribute("data-wait", wanted && hovering && !focused && !instant);
    }

    // after Escape it stays closed until the pointer and the focus have both left
    function settle() {
      if (!hovering && !focused) dismissed = false;
      show();
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      dismissed = true;
      show();
    }

    const onEnter = (event: Event) => {
      if ((event as PointerEvent).pointerType === "touch") return;
      hovering = true;
      show();
    };
    const onLeave = () => {
      hovering = false;
      settle();
    };
    const onFocus = () => {
      // a click focuses a button too, but only the keyboard should open the tooltip
      try {
        focused = host.matches(":focus-visible");
      } catch {
        focused = true;
      }
      show();
    };
    const onBlur = () => {
      focused = false;
      settle();
    };

    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("focus", onFocus);
    host.addEventListener("blur", onBlur);
    return () => {
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("focus", onFocus);
      host.removeEventListener("blur", onBlur);
      document.removeEventListener("keydown", onKey);
    };
  }, [side]);

  return (
    <span ref={tip} className={`${styles.tip} ${styles[side]}`} aria-hidden="true" data-tooltip="">
      {label}
    </span>
  );
}
