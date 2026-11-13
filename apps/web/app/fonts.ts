import { JetBrains_Mono, Onest, Unbounded } from "next/font/google";

// The three typefaces, loaded once here because two documents need them: the layout of every
// page and the page for an address that matches none (global-not-found.tsx).
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "latin-ext"],
});

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "latin-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
});

/** For `<html className>`: it makes the font variables the design tokens read. */
export const FONT_CLASSES = `${unbounded.variable} ${onest.variable} ${jetbrainsMono.variable}`;
