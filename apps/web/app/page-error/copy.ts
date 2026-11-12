import type { Lang } from "../locales";

type Copy = {
  heading: string;
  text: string;
  retry: string;
  home: string;
};

const en: Copy = {
  heading: "We couldn't show this page",
  text: "Something went wrong on our side. Nothing was lost. Try again, or come back in a few minutes.",
  retry: "Try again",
  home: "Back to the home page",
};

// Needs a native French review before launch.
const fr: Copy = {
  heading: "Nous n'avons pas pu afficher cette page",
  text: "Un problème est survenu de notre côté. Rien n'a été perdu. Réessayez, ou revenez dans quelques minutes.",
  retry: "Réessayer",
  home: "Retour à l'accueil",
};

export const copy: Record<Lang, Copy> = { en, fr };
