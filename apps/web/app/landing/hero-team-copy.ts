import type { Lang } from "../locales";

// The words the hero's crowd draws when your idea gathers a team. They are canvas text, hidden
// from screen readers (nothing here is needed to use the page). The people are made up.
export type HeroTeamCopy = {
  /** The chip that hangs from the pointer, and the ghost's. */
  idea: string;
  /** The one Lagoon caption: the matcher suggesting people by role. */
  suggested: string;
  invited: string;
  /** For a developer who asks to join, instead of being invited. */
  asks: string;
  signed: string;
  /** The role labels, in the order of the builders' role numbers in gather.ts. */
  roles: readonly [string, string, string, string, string, string, string, string];
};

export const heroTeamCopy: Record<Lang, HeroTeamCopy> = {
  en: {
    idea: "Your idea",
    suggested: "Suggested by role",
    invited: "Invitation sent",
    asks: "Asks to join",
    signed: "Signed",
    roles: ["Backend", "Mobile", "Security", "Frontend", "Design", "Data", "Product", "Testing"],
  },
  // Needs a native French review before launch.
  fr: {
    idea: "Votre idée",
    suggested: "Proposé par rôle",
    invited: "Invitation envoyée",
    asks: "Demande à rejoindre",
    signed: "Signé",
    roles: ["Backend", "Mobile", "Sécurité", "Frontend", "Design", "Données", "Produit", "Tests"],
  },
};
