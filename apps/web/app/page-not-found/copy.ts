import type { Lang } from "../locales";

type Copy = {
  pageTitle: string;
  heading: string;
  text: string;
  /** Followed by the address the visitor asked for. */
  asked: string;
  home: string;
  village: string;
  back: string;
  placesHeading: string;
  signIn: string;
  /** The small scene beside the text: people who wandered off, and the tree they gather under. */
  stage: { missing: string; gathered: string; gather: string; scatter: string };
};

const en: Copy = {
  pageTitle: "Page not found | Village Sqwhere",
  heading: "We can't find this page",
  text: "The address may be mistyped, or the page may have moved. Here are the ways back.",
  asked: "You asked for",
  home: "Back to the home page",
  village: "Back to your village",
  back: "Go back to where you were",
  placesHeading: "Or go straight to",
  signIn: "Sign in",
  stage: {
    missing: "404. Nobody is gathered at this address.",
    gathered: "Everyone is back under the tree. This page is still missing.",
    gather: "Call everyone back",
    scatter: "Let them wander",
  },
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Page introuvable | Village Sqwhere",
  heading: "Nous ne trouvons pas cette page",
  text: "L'adresse est peut-être mal saisie, ou la page a été déplacée. Voici comment revenir.",
  asked: "Vous avez demandé",
  home: "Retour à l'accueil",
  village: "Retour à votre village",
  back: "Revenir là où vous étiez",
  placesHeading: "Ou aller directement à",
  signIn: "Connexion",
  stage: {
    missing: "404. Personne n'est réuni à cette adresse.",
    gathered: "Tout le monde est de retour sous l'arbre. Cette page manque toujours.",
    gather: "Rappeler tout le monde",
    scatter: "Les laisser repartir",
  },
};

export const copy: Record<Lang, Copy> = { en, fr };
