import type { Lang } from "../locales";

type Step = { title: string; text: string };
type Stop = { text: string; time: string };

type Copy = {
  description: string;
  navLabel: string;
  navHow: string;
  navTour: string;
  signIn: string;
  signOut: string;
  soon: string;
  /** Under "Try the demo": what it is, then how opening it is going. */
  demo: { idle: string; opening: string; unavailable: string; network: string; failed: string };
  tourNote: string;
  switchText: string;
  switchLabel: string;
  toDark: string;
  toLight: string;
  pause: string;
  play: string;
  headline: string;
  sub: string;
  ctaJoin: string;
  ctaDemo: string;
  ctaTour: string;
  howTitle: string;
  howLead: string;
  steps: Step[];
  tourTitle: string;
  tourLead: string;
  tourButton: string;
  stops: Stop[];
  total: Stop;
  footLabel: string;
  footTag: string;
  footDemo: string;
  footCopy: string;
  footLang: string;
  footCredit: string;
};

// U+2060 (word joiner) after "co-" keeps "co-builders" on one line.
const en: Copy = {
  description:
    "The village square for African developers: share ideas, get matched with collaborators, and build together.",
  navLabel: "Main",
  navHow: "How it works",
  navTour: "Tour",
  signIn: "Sign in",
  signOut: "Sign out",
  soon: "Coming soon",
  demo: {
    idle: "No sign-up. Look at everything, change nothing.",
    opening: "Opening the demo",
    unavailable: "The demo is not available right now. You can still sign in with GitHub.",
    network: "We couldn't reach Village Sqwhere. Check your connection and try again.",
    failed: "The demo did not open. Try again.",
  },
  tourNote: "The guided tour is coming soon.",
  switchText: "FR",
  switchLabel: "Passer en français",
  toDark: "Switch to dark mode",
  toLight: "Switch to light mode",
  pause: "Pause animation",
  play: "Play animation",
  headline: "Builders across Africa, one square.",
  sub: "Share an idea. Get matched with co-⁠builders. Build it together.",
  ctaJoin: "Join the village",
  ctaDemo: "Try the demo",
  ctaTour: "Take the tour",
  howTitle: "From an idea to a team, in four steps.",
  howLead:
    "Builders from anywhere on the continent, one square to meet in. Here is what happens between sharing an idea and building it together.",
  steps: [
    {
      title: "Idea",
      text: "Share what you want to build, in English or French. Say which skills you bring and which ones the idea is missing.",
    },
    {
      title: "Matcher",
      text: "The matcher reads your idea and suggests developers across the continent whose skills fill the gaps, each with a fit score from 0 to 100.",
    },
    {
      title: "Team",
      text: "You decide who joins, from 2 to 5 builders. Nobody is hired: it is a team of equals, building together.",
    },
    {
      title: "Hub",
      text: "The team builds in one hub, in four phases: brainstorm, design and architecture, build, then review and test.",
    },
  ],
  tourTitle: "See the whole product in three minutes.",
  tourLead:
    "A guided route through a live demo account. No sign-up, and you can leave the route at any stop to look around.",
  tourButton: "Start the tour",
  stops: [
    { text: "Share an idea in Dakar", time: "0:30" },
    { text: "Watch the matcher score co-⁠builders", time: "0:45" },
    { text: "Approve a team of four", time: "0:30" },
    { text: "Walk the hub's four phases", time: "1:15" },
  ],
  total: { text: "Total", time: "3:00" },
  footLabel: "Footer",
  footTag: "Where African developers turn ideas into teams.",
  footDemo: "Try the demo",
  footCopy: "© 2026 Village Sqwhere.",
  footLang: "Available in English and French.",
  footCredit: "Made for ACODev 2026.",
};

// Needs a native French review before launch.
const fr: Copy = {
  description:
    "La place du village des développeurs africains. Partagez vos idées, trouvez des partenaires et construisez ensemble.",
  navLabel: "Principale",
  navHow: "Comment ça marche",
  navTour: "Visite",
  signIn: "Connexion",
  signOut: "Déconnexion",
  soon: "Bientôt disponible",
  demo: {
    idle: "Sans inscription. Regardez tout, sans rien modifier.",
    opening: "Ouverture de la démo",
    unavailable: "La démo n'est pas disponible pour le moment. Vous pouvez toujours vous connecter avec GitHub.",
    network: "Nous n'avons pas pu joindre Village Sqwhere. Vérifiez votre connexion et réessayez.",
    failed: "La démo ne s'est pas ouverte. Réessayez.",
  },
  tourNote: "La visite guidée arrive bientôt.",
  switchText: "EN",
  switchLabel: "Switch to English",
  toDark: "Passer en mode sombre",
  toLight: "Passer en mode clair",
  pause: "Mettre l'animation en pause",
  play: "Lire l'animation",
  headline: "Toute l'Afrique, une seule place.",
  sub: "Partagez une idée. Trouvez vos partenaires. Construisez ensemble.",
  ctaJoin: "Rejoindre le village",
  ctaDemo: "Essayer la démo",
  ctaTour: "Faire la visite",
  howTitle: "D'une idée à une équipe, en quatre étapes.",
  howLead:
    "Des développeurs de tout le continent, une seule place pour se retrouver. Voici ce qui se passe entre le partage d'une idée et sa construction en équipe.",
  steps: [
    {
      title: "Idée",
      text: "Partagez ce que vous voulez construire, en anglais ou en français. Dites quelles compétences vous apportez et lesquelles manquent à l'idée.",
    },
    {
      title: "Le matcher",
      text: "Le matcher lit votre idée et propose des développeurs de tout le continent dont les compétences comblent les manques, chacun avec un score de 0 à 100.",
    },
    {
      title: "Équipe",
      text: "Vous décidez qui rejoint l'équipe, de 2 à 5 développeurs. Personne n'est recruté. C'est une équipe d'égaux, qui construit ensemble.",
    },
    {
      title: "Espace",
      text: "L'équipe construit dans un seul espace, en quatre phases. D'abord le brainstorm, puis la conception et l'architecture, la construction, et enfin la revue et les tests.",
    },
  ],
  tourTitle: "Découvrez tout le produit en trois minutes.",
  tourLead:
    "Un parcours guidé dans un compte de démo en direct. Sans inscription, et vous pouvez quitter le parcours à chaque étape pour explorer.",
  tourButton: "Commencer la visite",
  stops: [
    { text: "Partager une idée à Dakar", time: "0:30" },
    { text: "Voir le matcher noter des partenaires", time: "0:45" },
    { text: "Valider une équipe de quatre", time: "0:30" },
    { text: "Parcourir les quatre phases de l'espace", time: "1:15" },
  ],
  total: { text: "Total", time: "3:00" },
  footLabel: "Pied de page",
  footTag: "Là où les développeurs africains transforment leurs idées en équipes.",
  footDemo: "Essayer la démo",
  footCopy: "© 2026 Village Sqwhere.",
  footLang: "Disponible en anglais et en français.",
  footCredit: "Conçu pour l'ACODev 2026.",
};

export const copy: Record<Lang, Copy> = { en, fr };
