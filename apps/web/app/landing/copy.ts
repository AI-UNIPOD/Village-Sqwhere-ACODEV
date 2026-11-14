import type { Lang } from "../locales";

type Copy = {
  description: string;
  navLabel: string;
  navHow: string;
  navMatcher: string;
  navHub: string;
  navFaq: string;
  signIn: string;
  signOut: string;
  /** Under "Try the demo": what it is, then how opening it is going. */
  demo: { idle: string; opening: string; unavailable: string; network: string; failed: string };
  toDark: string;
  toLight: string;
  pause: string;
  play: string;
  headline: string;
  sub: string;
  ctaJoin: string;
  ctaDemo: string;
  footLabel: string;
  footTag: string;
  footDemo: string;
  footCopy: string;
  footMadeUp: string;
  footLang: string;
  footCredit: string;
};

const en: Copy = {
  description:
    "The village square for African developers: share ideas, get matched with collaborators, and build together.",
  navLabel: "Main",
  navHow: "How it works",
  navMatcher: "Matcher",
  navHub: "Hub",
  navFaq: "FAQ",
  signIn: "Sign in",
  signOut: "Sign out",
  demo: {
    idle: "No sign-up. Made-up people and ideas, and nothing can be changed. A short tour is inside.",
    opening: "Opening the demo",
    unavailable: "The demo is not available right now. You can still sign in with GitHub.",
    network: "We couldn't reach Village Sqwhere. Check your connection and try again.",
    failed: "The demo did not open. Try again.",
  },
  toDark: "Switch to dark mode",
  toLight: "Switch to light mode",
  pause: "Pause animation",
  play: "Play animation",
  headline: "Builders across Africa, one square.",
  sub: "Share an idea. The matcher suggests developers verified in the roles you need. You choose your team and build together.",
  ctaJoin: "Join the village",
  ctaDemo: "Try the demo",
  footLabel: "Footer",
  footTag: "Where African developers turn ideas into teams.",
  footDemo: "Try the demo",
  footCopy: "© 2026 Village Sqwhere.",
  footMadeUp: "People and ideas on this page are made up.",
  footLang: "Available in English and French.",
  footCredit: "Made for ACODev 2026.",
};

// Needs a native French review before launch.
const fr: Copy = {
  description:
    "La place du village des développeurs africains. Partagez vos idées, trouvez des partenaires et construisez ensemble.",
  navLabel: "Principale",
  navHow: "Comment ça marche",
  navMatcher: "Matcher",
  navHub: "Espace",
  navFaq: "FAQ",
  signIn: "Connexion",
  signOut: "Déconnexion",
  demo: {
    idle: "Sans inscription. Des personnes et des idées fictives, et rien ne peut être modifié. Une courte visite guidée est incluse.",
    opening: "Ouverture de la démo",
    unavailable: "La démo n'est pas disponible pour le moment. Vous pouvez toujours vous connecter avec GitHub.",
    network: "Nous n'avons pas pu joindre Village Sqwhere. Vérifiez votre connexion et réessayez.",
    failed: "La démo ne s'est pas ouverte. Réessayez.",
  },
  toDark: "Passer en mode sombre",
  toLight: "Passer en mode clair",
  pause: "Mettre l'animation en pause",
  play: "Lire l'animation",
  headline: "Toute l'Afrique, une seule place.",
  sub: "Partagez une idée. Le matcher propose des développeurs vérifiés dans les rôles recherchés. Vous composez l'équipe et construisez ensemble.",
  ctaJoin: "Rejoindre le village",
  ctaDemo: "Essayer la démo",
  footLabel: "Pied de page",
  footTag: "Là où les développeurs africains transforment leurs idées en équipes.",
  footDemo: "Essayer la démo",
  footCopy: "© 2026 Village Sqwhere.",
  footMadeUp: "Les personnes et les idées présentées sur cette page sont fictives.",
  footLang: "Disponible en anglais et en français.",
  footCredit: "Conçu pour l'ACODev 2026.",
};

export const copy: Record<Lang, Copy> = { en, fr };
