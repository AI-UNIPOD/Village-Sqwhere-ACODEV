"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./landing-page.module.css";

// "Back to top", once the visitor is a screen down. It sits at the end of <main>, sticky to the
// bottom of the screen: it floats over the sections as they scroll and stops just above the
// footer instead of covering it. The pill menu is at the top, so the two never meet. It steps
// aside while a list marked data-clear-of-to-top passes under it (the FAQ's questions), so it
// never covers a row's own control.
export function BackToTop({ label }: { label: string }) {
  const [shown, setShown] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const check = () => {
      const spot = button.current?.getBoundingClientRect();
      const underIt = (el: Element) => {
        const list = el.getBoundingClientRect();
        return !!spot && list.top < spot.bottom && list.bottom > spot.top;
      };
      const clear = ![...document.querySelectorAll("[data-clear-of-to-top]")].some(underIt);
      setShown(window.scrollY > window.innerHeight && clear);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);

  const toTop = () => {
    // glides there unless the visitor asks for reduced motion (scroll-behavior in globals.css)
    window.scrollTo({ top: 0 });
    // keyboard focus goes back to the top as well, so the next Tab starts from the headline
    const headline = document.querySelector<HTMLElement>("main h1");
    if (!headline) return;
    headline.tabIndex = -1;
    headline.focus({ preventScroll: true });
  };

  return (
    <div className={styles.toTopDock}>
      <button
        ref={button}
        type="button"
        className={styles.toTop}
        aria-label={label}
        data-shown={shown ? "" : undefined}
        onClick={toTop}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
        </svg>
      </button>
    </div>
  );
}
