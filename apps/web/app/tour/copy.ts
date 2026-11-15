import type { Lang } from "../locales";

type Copy = {
  /** The panel's name for a screen reader. */
  label: string;
  /** "Stop {n} of {total}": the start has no count. */
  count: string;
  /** The start, then the four stops: the heading and two short sentences each. */
  stops: { name: string; text: string }[];
  start: string;
  next: string;
  back: string;
  finish: string;
  end: string;
  backToRoute: string;
  /** After the last stop: the words around the link to sign-in. */
  ending: { before: string; link: string; after: string };
  /** Said when the demo's idea and hub could not be found. */
  failed: { text: string; retry: string };
};

export const copy: Record<Lang, Copy> = {
  en: {
    label: "Tour",
    count: "Stop {n} of {total}",
    stops: [
      {
        name: "Your village",
        text: "A developer's village holds their ideas, their hubs and their matches. Four stops, about three minutes, and nothing is saved.",
      },
      {
        name: "Share an idea",
        text: "An idea has a public part that signed-in developers see, with the roles it needs. It also has a private brief only the team reads.",
      },
      {
        name: "See who the matcher suggests",
        text: "The matcher suggests verified developers whose role the idea needs. It gives each one a score and says how it was counted.",
      },
      {
        name: "Invite your team",
        text: "The owner invites developers, or answers those who ask to join. Each person reads the agreement and signs, up to five people with the owner. When the team is ready, the owner confirms it and Brainstorm opens.",
      },
      {
        name: "Follow the hub's four phases",
        text: "A hub moves through four phases: brainstorm, design and architecture, build, then review and test. Its owner moves it from one to the next. This hub is in Build; its notes, its sketch and its build tab are below. Each phase has its tool on the hub page.",
      },
    ],
    start: "Start the route",
    next: "Next",
    back: "Back",
    finish: "Finish",
    end: "End the tour",
    backToRoute: "Back to the route",
    ending: { before: "That is the route. Keep looking around, or ", link: "sign in with GitHub", after: " to start your own." },
    failed: { text: "We couldn't load the route. Nothing was changed, so try again.", retry: "Try again" },
  },
  // Needs a native French review before launch.
  fr: {
    label: "Visite guidée",
    count: "Étape {n} sur {total}",
    stops: [
      {
        name: "Votre village",
        text: "Le village d'un développeur réunit ses idées, ses espaces et ses correspondances. Quatre étapes, environ trois minutes, et rien n'est enregistré.",
      },
      {
        name: "Partager une idée",
        text: "Une idée a une partie publique que voient les développeurs connectés, avec les rôles dont elle a besoin. Elle a aussi un brief privé que seule l'équipe lit.",
      },
      {
        name: "Voir qui le matcher propose",
        text: "Le matcher propose des développeurs vérifiés dont le rôle manque à l'idée. Il donne à chacun un score et dit comment il a été compté.",
      },
      {
        name: "Inviter votre équipe",
        text: "Le porteur invite des développeurs, ou répond à ceux qui demandent à rejoindre l'espace. Chacun lit l'accord et le signe, jusqu'à cinq personnes avec le porteur. Quand l'équipe est prête, le porteur la confirme et le brainstorm s'ouvre.",
      },
      {
        name: "Suivre les quatre phases de l'espace",
        text: "Un espace traverse quatre phases\u202f: brainstorm, conception et architecture, construction, puis revue et tests. Son porteur le fait passer de l'une à l'autre. Cet espace est en Construction\u202f; ses notes, son schéma et son onglet de construction sont en dessous. Chaque phase a son outil sur la page de l'espace.",
      },
    ],
    start: "Commencer le parcours",
    next: "Suivant",
    back: "Retour",
    finish: "Terminer",
    end: "Quitter la visite",
    backToRoute: "Revenir au parcours",
    ending: { before: "Voilà le parcours. Continuez à regarder autour de vous, ou ", link: "connectez-vous avec GitHub", after: " pour lancer le vôtre." },
    failed: { text: "Nous n'avons pas pu charger le parcours. Rien n'a été modifié, réessayez.", retry: "Réessayer" },
  },
};
