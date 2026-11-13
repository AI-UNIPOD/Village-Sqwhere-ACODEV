import type { Lang } from "../locales";

type Field = { label: string; help: string };
type Screen = { title: string; text: string };

type Copy = {
  // your hubs
  minePageTitle: string;
  mineTitle: string;
  mineLead: string;
  emptyTitle: string;
  emptyText: string;
  yourIdeas: string;
  members: string;
  owner: string;
  member: string;
  active: string;
  archived: string;
  loadMore: string;
  // creating a hub
  newPageTitle: string;
  newTitle: string;
  newLead: string;
  hubHeading: string;
  name: Field;
  description: Field;
  termsHeading: string;
  termsWarning: Screen;
  ownershipLabel: string;
  ownership: { equal_split: Screen; owner_majority: Screen; custom: Screen };
  notes: Field;
  agreementHeading: string;
  version: string;
  placeholder: Screen;
  agreementRegion: string;
  read: string;
  legalName: Field;
  sign: string;
  confirm: { title: string; signedAs: string; frozen: string; confirm: string; cancel: string };
  errors: {
    nameRequired: string;
    nameLong: string;
    descriptionLong: string;
    notesRequired: string;
    notesLong: string;
    read: string;
    legalName: string;
    changed: string;
    send: string;
  };
  blocked: { missing: Screen; notOpen: Screen; exists: Screen; noAgreement: Screen };
  openComposer: string;
  yourHubs: string;
  // one hub
  viewPageTitle: string;
  created: string;
  ideaHeading: string;
  editIdea: string;
  teamHeading: string;
  inviteNext: string;
  notMember: string;
  verified: string;
  githubProfile: string;
  termsFrozen: string;
  agreementVersion: string;
  phasesHeading: string;
  phases: string[];
  phasesNote: string;
  notStarted: string;
  missingHub: Screen;
  // on an idea's card
  createHub: string;
  openHub: string;
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
};

const en: Copy = {
  minePageTitle: "Your hubs | Village Sqwhere",
  mineTitle: "Your hubs",
  mineLead: "The teams you are building with.",
  emptyTitle: "No hubs yet",
  emptyText: "A hub starts from an open idea. Share one, publish it, then create its hub.",
  yourIdeas: "Your ideas",
  members: "{n} of 5 members",
  owner: "Owner",
  member: "Member",
  active: "Active",
  archived: "Archived",
  loadMore: "Show more",
  newPageTitle: "Create the hub | Village Sqwhere",
  newTitle: "Create the hub",
  newLead:
    "A hub is where your team builds {idea}. You set its terms and sign the agreement first; everyone you invite signs the same.",
  hubHeading: "The hub",
  name: { label: "Hub name", help: "Up to 120 characters. Your team will see it everywhere." },
  description: {
    label: "What the team will do first (optional)",
    help: "A few lines for the people you invite. Up to 2,000 characters.",
  },
  termsHeading: "Terms",
  termsWarning: {
    title: "Terms cannot be changed after the hub is created",
    text: "Every member signs these same terms.",
  },
  ownershipLabel: "How is ownership shared?",
  ownership: {
    equal_split: { title: "Equal split", text: "Every member owns an equal share of what the team builds." },
    owner_majority: {
      title: "Owner majority",
      text: "The idea's owner keeps the larger share; the notes say how much.",
    },
    custom: { title: "Custom", text: "Something else, written in the notes." },
  },
  notes: {
    label: "Notes",
    help: "Say how ownership is shared, for example: the owner keeps 40%, the rest is split equally. Up to 1,000 characters.",
  },
  agreementHeading: "The agreement",
  version: "Version {n}",
  placeholder: {
    title: "This is placeholder text, not a legal agreement",
    text: "The real agreement replaces it before launch.",
  },
  agreementRegion: "Agreement text",
  read: "I have read this agreement and the terms above.",
  legalName: {
    label: "Your full legal name",
    help: "Typing your name here is your signature. We record it with this exact text, the terms, the time and your connection details.",
  },
  sign: "Sign and create the hub",
  confirm: {
    title: "Create this hub?",
    signedAs: "Signed as {name}",
    frozen: "The terms cannot be changed afterwards.",
    confirm: "Sign and create",
    cancel: "Go back",
  },
  errors: {
    nameRequired: "Give the hub a name.",
    nameLong: "Shorten the name to 120 characters or fewer.",
    descriptionLong: "Shorten this to 2,000 characters or fewer.",
    notesRequired: "Say in the notes how ownership is shared.",
    notesLong: "Shorten the notes to 1,000 characters or fewer.",
    read: "Read the agreement, then tick this box to sign.",
    legalName: "Type your full legal name, at least 2 characters.",
    changed: "The agreement changed while you were reading. Read the new text, then sign again.",
    send: "We couldn't create the hub. Nothing you typed was lost, so check your connection and try again.",
  },
  blocked: {
    missing: { title: "We couldn't find this idea", text: "It may have been removed, or it belongs to another account." },
    notOpen: {
      title: "Publish the idea first",
      text: "A hub can only be created for an open idea.",
    },
    exists: { title: "This idea already has a hub", text: "An idea has one hub. You will find it among your hubs." },
    noAgreement: {
      title: "Hubs cannot be created right now",
      text: "The agreement has not been published on this server.",
    },
  },
  openComposer: "Open the idea",
  yourHubs: "Your hubs",
  viewPageTitle: "A hub | Village Sqwhere",
  created: "Your hub is ready. You are its owner and first member.",
  ideaHeading: "The idea",
  editIdea: "Edit the idea",
  teamHeading: "Team",
  inviteNext: "Inviting teammates comes next. You will choose them from developers whose verified role fills a gap.",
  notMember: "You are not a member of this hub.",
  verified: "Verified",
  githubProfile: "GitHub profile, opens in a new tab",
  termsFrozen: "Signed by every member. These cannot be changed.",
  agreementVersion: "Version {n} of the hub agreement",
  phasesHeading: "Phases",
  phases: ["Brainstorm", "Design and architecture", "Build", "Review and test"],
  phasesNote: "The team moves through these one at a time. They open when the team is in place.",
  notStarted: "Not started",
  missingHub: { title: "We couldn't find this hub", text: "It may have been removed, or the address is wrong." },
  createHub: "Create the hub",
  openHub: "Open the hub",
  loading: "Getting your hubs",
  errorTitle: "We couldn't show this page",
  errorText:
    "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
};

// Needs a native French review before launch.
const fr: Copy = {
  minePageTitle: "Vos espaces | Village Sqwhere",
  mineTitle: "Vos espaces",
  mineLead: "Les équipes avec lesquelles vous construisez.",
  emptyTitle: "Pas encore d'espace",
  emptyText: "Un espace part d'une idée ouverte. Partagez-en une, publiez-la, puis créez son espace.",
  yourIdeas: "Vos idées",
  members: "Membres\u202f: {n} sur 5",
  owner: "Porteur",
  member: "Membre",
  active: "Actif",
  archived: "Archivé",
  loadMore: "Afficher plus",
  newPageTitle: "Créer l'espace | Village Sqwhere",
  newTitle: "Créer l'espace",
  newLead:
    "Un espace est l'endroit où votre équipe construit {idea}. Vous fixez ses conditions et signez l'accord en premier\u202f; chaque personne invitée signe le même.",
  hubHeading: "L'espace",
  name: { label: "Nom de l'espace", help: "Jusqu'à 120 caractères. Votre équipe le verra partout." },
  description: {
    label: "Ce que l'équipe fera en premier (facultatif)",
    help: "Quelques lignes pour les personnes que vous invitez. Jusqu'à 2\u202f000 caractères.",
  },
  termsHeading: "Conditions",
  termsWarning: {
    title: "Les conditions ne peuvent plus changer après la création de l'espace",
    text: "Chaque membre signe ces mêmes conditions.",
  },
  ownershipLabel: "Comment la propriété est-elle partagée\u202f?",
  ownership: {
    equal_split: {
      title: "Parts égales",
      text: "Chaque membre possède une part égale de ce que l'équipe construit.",
    },
    owner_majority: {
      title: "Majorité au porteur",
      text: "Le porteur de l'idée garde la plus grande part\u202f; les notes disent combien.",
    },
    custom: { title: "Sur mesure", text: "Autre chose, décrit dans les notes." },
  },
  notes: {
    label: "Notes",
    help: "Dites comment la propriété est partagée, par exemple\u202f: le porteur garde 40\u202f%, le reste est partagé à parts égales. Jusqu'à 1\u202f000 caractères.",
  },
  agreementHeading: "L'accord",
  version: "Version {n}",
  placeholder: {
    title: "Ceci est un texte provisoire, pas un accord juridique",
    text: "Le véritable accord le remplacera avant le lancement.",
  },
  agreementRegion: "Texte de l'accord",
  read: "J'ai lu cet accord et les conditions ci-dessus.",
  legalName: {
    label: "Votre nom légal complet",
    help: "Saisir votre nom ici vaut signature. Nous l'enregistrons avec ce texte exact, les conditions, l'heure et les informations de votre connexion.",
  },
  sign: "Signer et créer l'espace",
  confirm: {
    title: "Créer cet espace\u202f?",
    signedAs: "Signé par {name}",
    frozen: "Les conditions ne pourront plus être modifiées.",
    confirm: "Signer et créer",
    cancel: "Revenir",
  },
  errors: {
    nameRequired: "Donnez un nom à l'espace.",
    nameLong: "Raccourcissez le nom à 120 caractères au plus.",
    descriptionLong: "Raccourcissez ce texte à 2\u202f000 caractères au plus.",
    notesRequired: "Dites dans les notes comment la propriété est partagée.",
    notesLong: "Raccourcissez les notes à 1\u202f000 caractères au plus.",
    read: "Lisez l'accord, puis cochez cette case pour signer.",
    legalName: "Saisissez votre nom légal complet, au moins 2 caractères.",
    changed: "L'accord a changé pendant votre lecture. Lisez le nouveau texte, puis signez à nouveau.",
    send: "Nous n'avons pas pu créer l'espace. Rien de ce que vous avez saisi n'est perdu, vérifiez votre connexion et réessayez.",
  },
  blocked: {
    missing: {
      title: "Nous n'avons pas trouvé cette idée",
      text: "Elle a peut-être été supprimée, ou elle appartient à un autre compte.",
    },
    notOpen: {
      title: "Publiez d'abord l'idée",
      text: "Un espace ne peut être créé que pour une idée ouverte.",
    },
    exists: {
      title: "Cette idée a déjà un espace",
      text: "Une idée a un seul espace. Vous le trouverez parmi vos espaces.",
    },
    noAgreement: {
      title: "Impossible de créer un espace pour l'instant",
      text: "L'accord n'a pas été publié sur ce serveur.",
    },
  },
  openComposer: "Ouvrir l'idée",
  yourHubs: "Vos espaces",
  viewPageTitle: "Un espace | Village Sqwhere",
  created: "Votre espace est prêt. Vous en êtes le porteur et le premier membre.",
  ideaHeading: "L'idée",
  editIdea: "Modifier l'idée",
  teamHeading: "Équipe",
  inviteNext:
    "L'invitation des coéquipiers vient ensuite. Vous les choisirez parmi les développeurs dont le rôle vérifié comble un manque.",
  notMember: "Vous n'êtes pas membre de cet espace.",
  verified: "Vérifié",
  githubProfile: "profil GitHub, s'ouvre dans un nouvel onglet",
  termsFrozen: "Signées par chaque membre. Elles ne peuvent pas être modifiées.",
  agreementVersion: "Version {n} de l'accord de l'espace",
  phasesHeading: "Phases",
  phases: ["Brainstorm", "Conception et architecture", "Construction", "Revue et tests"],
  phasesNote: "L'équipe les traverse une à une. Elles s'ouvrent quand l'équipe est en place.",
  notStarted: "Pas commencée",
  missingHub: {
    title: "Nous n'avons pas trouvé cet espace",
    text: "Il a peut-être été supprimé, ou l'adresse est incorrecte.",
  },
  createHub: "Créer l'espace",
  openHub: "Ouvrir l'espace",
  loading: "Chargement de vos espaces",
  errorTitle: "Nous n'avons pas pu afficher cette page",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela se reproduit, revenez dans quelques minutes.",
  retry: "Réessayer",
};

export const copy: Record<Lang, Copy> = { en, fr };
