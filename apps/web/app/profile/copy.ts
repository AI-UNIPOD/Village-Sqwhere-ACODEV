import type { Lang } from "../locales";

type Field = { label: string; help: string };

// A section of chips saved as one list: the stack and the sectors.
export type Choices = {
  heading: string;
  lead: string;
  selected: string;
  save: string;
  saved: string;
  failed: string;
};

type Copy = {
  pageTitle: string;
  title: string;
  lead: string;
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
  githubProfile: string;
  you: {
    heading: string;
    name: Field;
    bio: Field;
    save: string;
    saved: string;
    count: string;
    errors: { name: string; bio: string; save: string };
  };
  roles: {
    heading: string;
    mainRole: string;
    verified: string;
    beingVerified: string;
    notVerified: string;
    verify: string;
    seeWhere: string;
    makeMain: string;
    remove: string;
    helper: string;
    addHeading: string;
    addHelp: string;
    none: string;
    setUp: string;
    confirm: { title: string; text: string; confirm: string; cancel: string };
    errors: { history: string; change: string; add: string };
  };
  stack: Choices;
  sectors: Choices;
  account: { heading: string; language: string };
};

const en: Copy = {
  pageTitle: "Your profile | Village Sqwhere",
  title: "Your profile",
  lead: "Your name, your roles and your stack. This is what idea owners see when they look for developers.",
  loading: "Opening your profile",
  errorTitle: "We couldn't show your profile",
  errorText:
    "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
  githubProfile: "GitHub profile, opens in a new tab",
  you: {
    heading: "You",
    name: { label: "Name", help: "GitHub may replace this name the next time you sign in." },
    bio: {
      label: "About you",
      help: "A line or two that idea owners will read. Where you build from, what you like working on.",
    },
    save: "Save",
    saved: "Saved",
    count: "{n} of {max}",
    errors: {
      name: "Enter a name of 1 to 80 characters.",
      bio: "Shorten this to 1,000 characters or fewer.",
      save: "We couldn't save your changes. Nothing you typed was lost, so check your connection and try again.",
    },
  },
  roles: {
    heading: "Roles",
    mainRole: "Main role",
    verified: "Verified",
    beingVerified: "Being verified",
    notVerified: "Not verified",
    verify: "Verify this role",
    seeWhere: "See where it stands",
    makeMain: "Make it my main role",
    remove: "Remove",
    helper: "Verification is for your main role. Make another role the main one to verify it.",
    addHeading: "Add a role",
    addHelp: "Press a role to add it. Remove undoes it.",
    none: "You have not chosen a role yet.",
    setUp: "Set up my profile",
    confirm: {
      title: "Remove this role?",
      text: "Ideas that need it will stop finding you through it.",
      confirm: "Remove role",
      cancel: "Keep it",
    },
    errors: {
      history: "This role has verification attempts, so it stays on your profile.",
      change: "We couldn't change this role. Nothing was changed, so check your connection and try again.",
      add: "We couldn't add that role. Nothing was changed, so check your connection and try again.",
    },
  },
  stack: {
    heading: "Stack",
    lead: "The technologies you build with. Idea owners see them next to your roles.",
    selected: "{n} selected",
    save: "Save stack",
    saved: "Saved",
    failed: "We couldn't save your stack. Your selection is still here, so check your connection and try again.",
  },
  sectors: {
    heading: "Sectors",
    lead: "The areas you want to build ideas in, the ones you chose when you joined.",
    selected: "{n} selected",
    save: "Save sectors",
    saved: "Saved",
    failed: "We couldn't save your sectors. Your selection is still here, so check your connection and try again.",
  },
  account: { heading: "Account", language: "Language" },
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Votre profil | Village Sqwhere",
  title: "Votre profil",
  lead: "Votre nom, vos rôles et vos technologies. C'est ce que voient les porteurs d'idées quand ils cherchent des développeurs.",
  loading: "Ouverture de votre profil",
  errorTitle: "Nous n'avons pas pu afficher votre profil",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela continue, revenez dans quelques minutes.",
  retry: "Réessayer",
  githubProfile: "profil GitHub, s'ouvre dans un nouvel onglet",
  you: {
    heading: "Vous",
    name: { label: "Nom", help: "GitHub peut remplacer ce nom à votre prochaine connexion." },
    bio: {
      label: "À propos de vous",
      help: "Une ou deux lignes que les porteurs d'idées liront. D'où vous construisez, ce que vous aimez faire.",
    },
    save: "Enregistrer",
    saved: "Enregistré",
    count: "{n} sur {max}",
    errors: {
      name: "Saisissez un nom de 1 à 80 caractères.",
      bio: "Raccourcissez ce texte à 1\u202f000 caractères ou moins.",
      save: "Nous n'avons pas pu enregistrer vos modifications. Rien de ce que vous avez saisi n'est perdu, vérifiez donc votre connexion et réessayez.",
    },
  },
  roles: {
    heading: "Rôles",
    mainRole: "Rôle principal",
    verified: "Vérifié",
    beingVerified: "En cours de vérification",
    notVerified: "Non vérifié",
    verify: "Faire vérifier ce rôle",
    seeWhere: "Voir où en est la vérification",
    makeMain: "En faire mon rôle principal",
    remove: "Retirer",
    helper:
      "La vérification porte sur votre rôle principal. Faites d'un autre rôle votre rôle principal pour le faire vérifier.",
    addHeading: "Ajouter un rôle",
    addHelp: "Appuyez sur un rôle pour l'ajouter. Retirer l'annule.",
    none: "Vous n'avez pas encore choisi de rôle.",
    setUp: "Configurer mon profil",
    confirm: {
      title: "Retirer ce rôle\u202f?",
      text: "Les idées qui en ont besoin ne vous trouveront plus grâce à lui.",
      confirm: "Retirer le rôle",
      cancel: "Le garder",
    },
    errors: {
      history:
        "Ce rôle a déjà des tentatives de vérification, il reste donc sur votre profil.",
      change:
        "Nous n'avons pas pu modifier ce rôle. Rien n'a changé, vérifiez donc votre connexion et réessayez.",
      add: "Nous n'avons pas pu ajouter ce rôle. Rien n'a changé, vérifiez donc votre connexion et réessayez.",
    },
  },
  stack: {
    heading: "Technologies",
    lead: "Les technologies avec lesquelles vous construisez. Les porteurs d'idées les voient à côté de vos rôles.",
    selected: "Sélection\u202f: {n}",
    save: "Enregistrer les technologies",
    saved: "Enregistré",
    failed:
      "Nous n'avons pas pu enregistrer vos technologies. Votre sélection est toujours là, vérifiez donc votre connexion et réessayez.",
  },
  sectors: {
    heading: "Domaines",
    lead: "Les domaines dans lesquels vous voulez construire des idées, ceux que vous avez choisis à votre arrivée.",
    selected: "Sélection : {n}",
    save: "Enregistrer les domaines",
    saved: "Enregistré",
    failed:
      "Nous n'avons pas pu enregistrer vos domaines. Votre sélection est toujours là, vérifiez donc votre connexion et réessayez.",
  },
  account: { heading: "Compte", language: "Langue" },
};

export const copy: Record<Lang, Copy> = { en, fr };
