import type { Lang } from "../locales";

type Copy = {
  pageTitle: string;
  loading: string;
  back: string;
  verified: string;
  country: string;
  roles: string;
  noRoles: string;
  stack: string;
  sectors: string;
  github: string;
  newTab: string;
  yours: string;
  editYours: string;
  goneTitle: string;
  goneText: string;
  errorTitle: string;
  errorText: string;
  retry: string;
};

const en: Copy = {
  pageTitle: "Developer profile",
  loading: "Loading the profile",
  back: "Back to the village",
  verified: "Verified",
  country: "Country: {country}",
  roles: "Verified roles",
  noRoles: "No role verified yet.",
  stack: "Stack",
  sectors: "Sectors",
  github: "See them on GitHub",
  newTab: "opens in a new tab",
  yours: "This is how other developers see you.",
  editYours: "Edit your profile",
  goneTitle: "We can't find this developer",
  goneText: "The account may have been deleted, or the address is wrong.",
  errorTitle: "This profile didn't load",
  errorText: "Something went wrong on our side. Nothing was lost, so try again.",
  retry: "Try again",
};

const fr: Copy = {
  pageTitle: "Profil de développeur",
  loading: "Chargement du profil",
  back: "Retour au village",
  verified: "Vérifié",
  country: "Pays : {country}",
  roles: "Rôles vérifiés",
  noRoles: "Aucun rôle vérifié pour l'instant.",
  stack: "Technologies",
  sectors: "Secteurs",
  github: "Voir son profil GitHub",
  newTab: "s'ouvre dans un nouvel onglet",
  yours: "Voici comment les autres développeurs vous voient.",
  editYours: "Modifier votre profil",
  goneTitle: "Nous ne trouvons pas ce développeur",
  goneText: "Le compte a peut-être été supprimé, ou l'adresse est incorrecte.",
  errorTitle: "Ce profil ne s'est pas chargé",
  errorText: "Un problème est survenu de notre côté. Rien n'a été perdu, réessayez.",
  retry: "Réessayer",
};

export const copy: Record<Lang, Copy> = { en, fr };
