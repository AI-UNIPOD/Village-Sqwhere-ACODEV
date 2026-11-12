"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { Lang } from "../locales";
import { signOut, useSession } from "./session";

export function SignOutButton({ lang, label, className }: { lang: Lang; label: string; className: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-busy={busy}
      onClick={() => {
        if (busy) return;
        setBusy(true);
        void signOut(lang);
      }}
    >
      {label}
    </button>
  );
}

// The header's last link: "Sign in" for visitors, "Sign out" once signed in. Before the
// session is known (prerender and hydration) it stays "Sign in", as the page was built.
export function AccountNavLink(props: { lang: Lang; signIn: string; signOut: string; className: string }) {
  const session = useSession();
  if (session) return <SignOutButton lang={props.lang} label={props.signOut} className={props.className} />;
  return (
    <Link className={props.className} href={`/${props.lang}/sign-in`}>
      {props.signIn}
    </Link>
  );
}

// Shows its children only to a signed-in person. Anyone else goes to sign-in; until the
// session is known, the fallback shows.
export function RequireSession({
  lang,
  fallback,
  children,
}: {
  lang: Lang;
  fallback: ReactNode;
  children: ReactNode;
}) {
  const session = useSession();
  useEffect(() => {
    if (session === null) window.location.replace(`/${lang}/sign-in`);
  }, [lang, session]);
  return session ? children : fallback;
}
