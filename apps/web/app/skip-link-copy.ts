import type { Lang } from "./locales";

// The first stop for the keyboard on every page (skip-link.tsx).
export const copy: Record<Lang, { skip: string }> = {
  en: { skip: "Skip to main content" },
  // Needs a native French review before launch.
  fr: { skip: "Aller au contenu principal" },
};
