import type { Lang } from "../locales";

type Copy = {
  /** The panel's name for a screen reader. */
  label: string;
  /** "Step {n} of {total}". */
  count: string;
  /** The six steps: the heading and two short sentences each. */
  steps: { name: string; text: string }[];
  start: string;
  next: string;
  back: string;
  finish: string;
  end: string;
  backToRoute: string;
  /** After the last step: the words around the link to sign-in. */
  ending: { before: string; link: string; after: string };
  /** Said when the demo's idea and hub could not be found. */
  failed: { text: string; retry: string };
};

export const copy: Record<Lang, Copy> = {
  en: {
    label: "Tour",
    count: "Step {n} of {total}",
    steps: [
      {
        name: "Your village",
        text: "A developer's village holds their ideas, their hubs and their matches. Six steps, and nothing is saved.",
      },
      {
        name: "The feed",
        text: "Developers share ideas, questions, RFCs and releases here. Press a kind above the list, or a topic on a post, to see only the posts that match.",
      },
      {
        name: "A conversation",
        text: "This is one question with its comments and replies. Replying works as it does for anyone, and nothing is saved here.",
      },
      {
        name: "Share an idea",
        text: "An idea has a public part that signed-in developers see, with the roles it needs. It also has a private brief only the team reads.",
      },
      {
        name: "The matcher",
        text: "The matcher suggests verified developers whose role the idea needs. It gives each one a score and says how it was counted.",
      },
      {
        name: "Your team and the hub",
        text: "The owner answers developers who ask to join, and each person reads the agreement and signs, up to five people with the owner. Further down the page are the hub's four phases: brainstorm, design and architecture, build, then review and test.",
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
    steps: [
      {
        name: "Votre village",
        text: "Le village d'un développeur réunit ses idées, ses espaces et ses correspondances. Six étapes, et rien n'est enregistré.",
      },
      {
        name: "Le fil",
        text: "Les développeurs y partagent des idées, des questions, des RFC et des versions. Appuyez sur un type au-dessus de la liste, ou sur un sujet dans une publication, pour ne voir que les publications qui correspondent.",
      },
      {
        name: "Une conversation",
        text: "Voici une question avec ses commentaires et leurs réponses. Répondre fonctionne comme pour n'importe qui, et rien n'est enregistré ici.",
      },
      {
        name: "Partager une idée",
        text: "Une idée a une partie publique que voient les développeurs connectés, avec les rôles dont elle a besoin. Elle a aussi un brief privé que seule l'équipe lit.",
      },
      {
        name: "Le matcher",
        text: "Le matcher propose des développeurs vérifiés dont le rôle manque à l'idée. Il donne à chacun un score et dit comment il a été compté.",
      },
      {
        name: "Votre équipe et l'espace",
        text: "Le porteur répond à ceux qui demandent à rejoindre l'espace, et chacun lit l'accord et le signe, jusqu'à cinq personnes avec le porteur. Plus bas sur la page se trouvent les quatre phases de l'espace\u202f: brainstorm, conception et architecture, construction, puis revue et tests.",
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
