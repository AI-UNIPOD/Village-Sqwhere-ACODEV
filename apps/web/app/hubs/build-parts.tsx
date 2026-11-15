"use client";

import type { ReactNode } from "react";

import landing from "../landing/landing-page.module.css";
import type { Lang } from "../locales";
import { copy } from "./copy";
import type { Line } from "./design-forms";
import type { Build } from "./hubs-api";

// Runs one change under `key`, which the button that started it shows as busy. `run` answers
// the line to say, or null when it already told the person (a field error).
export type Send = (key: string, run: () => Promise<Line | null>) => Promise<void>;

// What the parts of the build tab share: the hub, the change on its way, and the way to send one.
export type Shared = { lang: Lang; hubId: string; busy: string | null; send: Send; apply: (build: Build) => void };

// A GitHub address as a link that opens in a new tab. Anything else, and every address for the
// demo account (its repository cannot exist on GitHub), is plain text.
export function GithubLink({ lang, href, linkable, children }: { lang: Lang; href: string; linkable: boolean; children: ReactNode }) {
  if (!linkable || !href.startsWith("https://github.com/")) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className={landing.srOnly}>, {copy[lang].buildTab.opensNewTab}</span>
    </a>
  );
}
