import type { Lang } from "../locales";

type Copy = {
  pageTitle: string;
  heading: string;
  text: string;
  home: string;
};

const en: Copy = {
  pageTitle: "Page not found | Village Sqwhere",
  heading: "We can't find this page",
  text: "This page doesn't exist. Check the address, or go back to the home page.",
  home: "Back to the home page",
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Page introuvable | Village Sqwhere",
  heading: "Nous ne trouvons pas cette page",
  text: "Cette page n'existe pas. Vérifiez l'adresse, ou revenez à la page d'accueil.",
  home: "Retour à l'accueil",
};

export const copy: Record<Lang, Copy> = { en, fr };
