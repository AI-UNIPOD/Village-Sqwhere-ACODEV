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
    country: Field & { none: string };
    save: string;
    saved: string;
    count: string;
    errors: { name: string; bio: string; country: string; save: string };
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
  // deleting the account for good, behind a dialog with two checks
  deletion: {
    heading: string;
    text: string;
    open: string;
    title: string;
    goes: string;
    gone: string[];
    stays: string;
    kept: string[];
    understand: string;
    username: { label: string; help: string; mismatch: string };
    confirm: string;
    cancel: string;
    ownsHub: string;
    hubs: string;
    failed: string;
    goodbye: { pageTitle: string; title: string; text: string; home: string };
  };
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
    country: {
      label: "Country",
      help: "Optional. Other signed-in developers can see your country.",
      none: "No country",
    },
    save: "Save",
    saved: "Saved",
    count: "{n} of {max}",
    errors: {
      name: "Enter a name of 1 to 80 characters.",
      bio: "Shorten this to 1,000 characters or fewer.",
      country: "Choose a country from the list, or No country.",
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
  deletion: {
    heading: "Delete your account",
    text: "Deleting your account cannot be undone. You will be asked to confirm twice.",
    open: "Delete my account",
    title: "Delete your account for good?",
    goes: "What goes:",
    gone: [
      "Your name, username, bio, country, email and avatar.",
      "Your link to GitHub, your stack, your sectors and your feed topics.",
      "Your open ideas are closed, and a hub where you are the only member is archived.",
      "Your place in other hubs, your invitations and your requests to join.",
    ],
    stays: "What stays:",
    kept: [
      "Your posts, comments and signed agreements, shown under \"Deleted account\".",
    ],
    understand: "I understand that my account cannot be restored. Signing in again makes a new, empty account.",
    username: {
      label: "Type your username to confirm",
      help: "Your username is {username}.",
      mismatch: "That is not your username. Type it exactly as shown.",
    },
    confirm: "Delete my account",
    cancel: "Keep my account",
    ownsHub: "You own a hub that other members are still in. Your account can be deleted once nobody else is in it.",
    hubs: "Go to your hubs",
    failed: "We couldn't delete your account. Nothing changed, so try again.",
    goodbye: {
      pageTitle: "Account deleted | Village Sqwhere",
      title: "Your account was deleted",
      text: "You are signed out. Thank you for building with the village.",
      home: "Go to the home page",
    },
  },
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
    country: {
      label: "Pays",
      help: "Facultatif. Les autres développeurs connectés peuvent voir votre pays.",
      none: "Aucun pays",
    },
    save: "Enregistrer",
    saved: "Enregistré",
    count: "{n} sur {max}",
    errors: {
      name: "Saisissez un nom de 1 à 80 caractères.",
      bio: "Raccourcissez ce texte à 1\u202f000 caractères ou moins.",
      country: "Choisissez un pays dans la liste, ou Aucun pays.",
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
    selected: "Sélection\u202f: {n}",
    save: "Enregistrer les domaines",
    saved: "Enregistré",
    failed:
      "Nous n'avons pas pu enregistrer vos domaines. Votre sélection est toujours là, vérifiez donc votre connexion et réessayez.",
  },
  account: { heading: "Compte", language: "Langue" },
  deletion: {
    heading: "Supprimer votre compte",
    text: "La suppression de votre compte est définitive. Il vous sera demandé de confirmer deux fois.",
    open: "Supprimer mon compte",
    title: "Supprimer votre compte pour de bon\u202f?",
    goes: "Ce qui disparaît\u202f:",
    gone: [
      "Votre nom, votre nom d'utilisateur, votre bio, votre pays, votre e\u2011mail et votre avatar.",
      "Votre lien avec GitHub, vos technologies, vos secteurs et vos sujets de fil.",
      "Vos idées ouvertes sont fermées, et un espace dont vous êtes le seul membre est archivé.",
      "Votre place dans les autres espaces, vos invitations et vos demandes d'adhésion.",
    ],
    stays: "Ce qui reste\u202f:",
    kept: [
      "Vos publications, vos commentaires et vos accords signés, affichés sous «\u202fCompte supprimé\u202f».",
    ],
    understand: "Je comprends que mon compte ne peut pas être restauré. Me reconnecter crée un nouveau compte vide.",
    username: {
      label: "Saisissez votre nom d'utilisateur pour confirmer",
      help: "Votre nom d'utilisateur est {username}.",
      mismatch: "Ce n'est pas votre nom d'utilisateur. Saisissez-le exactement comme indiqué.",
    },
    confirm: "Supprimer mon compte",
    cancel: "Garder mon compte",
    ownsHub: "Vous êtes porteur d'un espace où d'autres membres sont encore présents. Votre compte pourra être supprimé quand plus personne d'autre n'y sera.",
    hubs: "Aller à vos espaces",
    failed: "Nous n'avons pas pu supprimer votre compte. Rien n'a changé, réessayez.",
    goodbye: {
      pageTitle: "Compte supprimé | Village Sqwhere",
      title: "Votre compte a été supprimé",
      text: "Vous êtes déconnecté. Merci d'avoir construit avec le village.",
      home: "Aller à l'accueil",
    },
  },
};

export const copy: Record<Lang, Copy> = { en, fr };
