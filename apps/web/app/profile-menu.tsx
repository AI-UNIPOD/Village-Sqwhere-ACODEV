"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { copy } from "./app-frame-copy";
import { initials } from "./initials";
import type { Lang } from "./locales";
import { fill } from "./onboarding/copy";
import styles from "./profile-menu.module.css";
import { signOut } from "./session/session";

// The signed-in developer in the header, on every screen: a round avatar with their initials that
// opens a short menu with their name, a link to the profile and the way out. It is a menu in the
// design system's sense (components.md): arrow keys move between the items, Escape closes it and
// gives focus back to the avatar, and so does a press outside it or a Tab out of it. `leave` is
// the way out's words: "Sign out", or for the demo account "Leave the demo".
export function ProfileMenu({ lang, name, username, leave }: { lang: Lang; name: string; username: string; leave: string }) {
  const t = copy[lang].account;
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  function close(giveFocusBack = true) {
    setOpen(false);
    if (giveFocusBack) trigger.current?.focus();
  }

  // a press anywhere else closes it, without taking focus from what was pressed
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // opening puts focus on the first item, as the keyboard expects of a menu
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) return;
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      all[(at + step + all.length) % all.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      all[event.key === "Home" ? 0 : all.length - 1]?.focus();
    } else if (event.key === "Tab") {
      // leaving the menu by Tab closes it; focus goes where Tab takes it
      close(false);
    }
  }

  return (
    <div ref={root} className={styles.root} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={fill(t.menuOf, { name })}
        onClick={() => setOpen((now) => !now)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials(name, username)}
        </span>
      </button>
      {open && (
        <div className={styles.panel}>
          <p className={styles.who}>
            <span className={styles.name}>{name}</span>
            <span className={styles.username}>@{username}</span>
          </p>
          <div id={menuId} role="menu" aria-label={t.menu} className={styles.menu}>
            <Link role="menuitem" className={styles.item} href={`/${lang}/profile`} onClick={() => setOpen(false)}>
              {t.profile}
            </Link>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              aria-busy={signingOut || undefined}
              onClick={() => {
                if (signingOut) return;
                setSigningOut(true);
                signOut(lang);
              }}
            >
              {leave}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
