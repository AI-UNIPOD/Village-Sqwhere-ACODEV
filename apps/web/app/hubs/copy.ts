import type { Lang } from "../locales";
import type { Phase, PhaseState } from "./hubs-api";

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
  notMember: string;
  verified: string;
  githubProfile: string;
  termsFrozen: string;
  agreementVersion: string;
  phasesHeading: string;
  phases: Record<Phase, string>;
  phaseStates: Record<PhaseState, string>;
  // where things stand, under the list
  phasesNote: { toConfirm: string; waiting: string; confirmed: string; confirmedOutside: string; archived: string };
  phaseActions: {
    confirm: { button: string; title: string; text: string; alone: string; done: string };
    forward: { button: string; title: string; text: string; done: string };
    back: { button: string; title: string; text: string; done: string };
    cancel: string;
    errors: { changed: string; unavailable: string; failed: string };
  };
  // the brainstorm notes under the phases
  brainstormNotes: {
    heading: string;
    loading: string;
    loadFailed: string;
    empty: string;
    emptyAfter: string;
    over: string;
    archived: string;
    refresh: string;
    refreshed: string;
    write: { label: string; help: string; left: string; add: string; added: string };
    delete: { label: string; title: string; text: string; confirm: string; cancel: string; done: string; gone: string };
    errors: { empty: string; long: string; changed: string; full: string; notAuthor: string; failed: string };
  };
  // the design sketch under the brainstorm notes
  designSketch: {
    heading: string;
    loading: string;
    loadFailed: string;
    empty: string;
    emptyAfter: string;
    intro: string;
    over: string;
    archived: string;
    refresh: string;
    refreshed: string;
    // what a piece points to and what points to it, in words a screen reader can say
    to: string;
    from: string;
  };
  missingHub: Screen;
  // the team and the brief on a hub's page
  team: {
    requested: string;
    invited: string;
    declined: string;
    approve: string;
    decline: string;
    withdraw: string;
    inviteAgain: string;
    named: string;
    approved: string;
    requestDeclined: string;
    requestGone: string;
    declineDialog: { title: string; text: string; confirm: string; cancel: string };
    withdrawDialog: { title: string; text: string; confirm: string; cancel: string };
    loadFailed: string;
    actionFailed: string;
    full: string;
    findMatches: string;
    form: { label: string; help: string; send: string; sent: string };
    errors: { notFound: string; alreadyMember: string; alreadyInvited: string; archived: string; invalid: string; failed: string };
  };
  brief: { heading: string; private: string; empty: string; write: string; loadFailed: string };
  // for a developer who was invited
  invitation: {
    title: string;
    text: string;
    sign: string;
    decline: string;
    dialog: { title: string; text: string; confirm: string; cancel: string };
    failed: string;
  };
  declinedNote: string;
  joined: string;
  invitations: { heading: string; by: string };
  // for a developer who asked to join: on the idea's page, and while the owner has not answered
  ask: {
    heading: string;
    what: string;
    button: string;
    asked: string;
    noHub: string;
    member: string;
    closed: string;
    withdraw: string;
    withdrawn: string;
    answered: string;
    wait: string;
    waitLater: string;
    loadFailed: string;
  };
  waiting: { heading: string; owner: string };
  // joining a hub by signing its agreement
  join: {
    pageTitle: string;
    title: string;
    lead: string;
    frozen: string;
    sign: string;
    confirm: { title: string; confirm: string; cancel: string };
    send: string;
    noInvitation: Screen;
    archived: Screen;
    full: Screen;
  };
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
  notMember: "You are not a member of this hub.",
  verified: "Verified",
  githubProfile: "GitHub profile, opens in a new tab",
  termsFrozen: "Signed by every member. These cannot be changed.",
  agreementVersion: "Version {n} of the hub agreement",
  phasesHeading: "Phases",
  phases: { brainstorm: "Brainstorm", design: "Design and architecture", build: "Build", review: "Review and test" },
  phaseStates: { done: "Done", in_progress: "In progress", not_started: "Not started" },
  phasesNote: {
    toConfirm: "Confirm the team when you are ready to start. Brainstorm opens, and you can still invite people after, up to five.",
    waiting: "The phases open when the owner confirms the team.",
    confirmed: "The owner moves the hub from one phase to the next. Brainstorm has its notes and Design and architecture has its sketch below; the tools for the other phases are still to come.",
    confirmedOutside: "The owner moves the hub from one phase to the next. The brainstorm notes and the design sketch are for the hub's members; the tools for the other phases are still to come.",
    archived: "This hub is archived, so its phases will not start.",
  },
  phaseActions: {
    confirm: {
      button: "Confirm the team",
      title: "Confirm the team?",
      text: "{n} people are in the team now. Brainstorm opens, and you can still invite people after, up to five.",
      alone: "You are the only member for now. Brainstorm opens, and you can still invite people after, up to five.",
      done: "The team is confirmed. Brainstorm is open.",
    },
    forward: {
      button: "Move to {phase}",
      title: "Move to {phase}?",
      text: "The hub moves on to {phase}. You can move it back.",
      done: "The hub is now in {phase}.",
    },
    back: {
      button: "Back to {phase}",
      title: "Go back to {phase}?",
      text: "The hub returns to {phase}. Nothing is deleted.",
      done: "The hub is back in {phase}.",
    },
    cancel: "Cancel",
    errors: {
      changed: "This hub was changed somewhere else. This is where it is now.",
      unavailable: "That action is not available on this hub. This is where it is now.",
      failed: "We couldn't save that. Nothing changed, so try again.",
    },
  },
  brainstormNotes: {
    heading: "Brainstorm notes",
    loading: "Getting the notes",
    loadFailed: "We couldn't load the notes. Nothing was changed, so check your connection and try again.",
    empty: "No notes yet. Write the first one.",
    emptyAfter: "No notes were written during brainstorm.",
    over: "Brainstorm is over. The notes stay here to read.",
    archived: "This hub is archived. The notes stay here to read.",
    refresh: "Refresh",
    refreshed: "The notes are up to date.",
    write: {
      label: "A new note",
      help: "Plain text. Everyone in the hub can read it.",
      left: "Characters left: {n}",
      add: "Add the note",
      added: "Your note was added.",
    },
    delete: {
      label: "Delete the note by {name}",
      title: "Delete this note?",
      text: "The note is removed for everyone in the hub. This cannot be undone.",
      confirm: "Delete the note",
      cancel: "Cancel",
      done: "The note was deleted.",
      gone: "That note was already deleted.",
    },
    errors: {
      empty: "Write a note before adding it.",
      long: "A note can have at most {max} characters. Shorten it and try again.",
      changed: "This hub has moved on, so notes can no longer be changed.",
      full: "This hub has 200 notes, the most it can hold. Delete one to add another.",
      notAuthor: "Only the note's author or the hub's owner can delete it.",
      failed: "We couldn't save that. Nothing changed, so try again.",
    },
  },
  designSketch: {
    heading: "Design sketch",
    loading: "Getting the sketch",
    loadFailed: "We couldn't load the sketch. Nothing was changed, so check your connection and try again.",
    empty: "No pieces yet.",
    emptyAfter: "No sketch was made during design and architecture.",
    intro: "This is the team's sketch of the system: its pieces and how they talk.",
    over: "Design and architecture is over. The sketch stays here to read.",
    archived: "This hub is archived. The sketch stays here to read.",
    refresh: "Refresh",
    refreshed: "The sketch is up to date.",
    to: "To {piece}: {label}",
    from: "From {piece}: {label}",
  },
  missingHub: { title: "We couldn't find this hub", text: "It may have been removed, or the address is wrong." },
  team: {
    requested: "Asked to join",
    invited: "Invited",
    declined: "Declined",
    approve: "Approve",
    decline: "Decline",
    withdraw: "Withdraw",
    inviteAgain: "Invite again",
    named: "{action}: {name}",
    approved: "{name} is invited. They read the agreement and sign to join.",
    requestDeclined: "You declined the request from {name}. You can invite them later.",
    requestGone: "That request is no longer waiting. The list is up to date.",
    declineDialog: {
      title: "Decline this request?",
      text: "They can ask again later, and you can invite them.",
      confirm: "Decline",
      cancel: "Go back",
    },
    withdrawDialog: {
      title: "Withdraw this invitation?",
      text: "They can be invited again later.",
      confirm: "Withdraw",
      cancel: "Keep it",
    },
    loadFailed: "We couldn't load the team. Nothing was changed, so check your connection and try again.",
    actionFailed: "That did not go through. Nothing was changed, so try again.",
    full: "The team is full: five members is the most a hub takes.",
    findMatches: "Find developers who match this idea",
    form: {
      label: "GitHub username",
      help: "The developer must have signed in to Village Sqwhere once.",
      send: "Send invite",
      sent: "Invitation sent to {name}.",
    },
    errors: {
      notFound:
        "No developer here has that username. Check the spelling, or ask them to sign in to Village Sqwhere first.",
      alreadyMember: "They are already in this hub.",
      alreadyInvited: "They already have an invitation.",
      archived: "This hub is archived, so nobody can be invited.",
      invalid: "Enter a GitHub username, like ada-obi.",
      failed: "The invitation was not sent. What you typed is still here, so check your connection and try again.",
    },
  },
  brief: {
    heading: "The brief",
    private: "Only the team sees this.",
    empty: "The owner has not written a brief yet.",
    write: "Write the brief",
    loadFailed: "We couldn't load the brief. Nothing was changed, so try again.",
  },
  invitation: {
    title: "You are invited to this hub.",
    text: "Read the agreement and the terms, then sign to join. Until you sign you cannot read the brief.",
    sign: "Read and sign",
    decline: "Decline",
    dialog: {
      title: "Decline this invitation?",
      text: "The owner can invite you again later.",
      confirm: "Decline",
      cancel: "Go back",
    },
    failed: "We couldn't decline the invitation. Nothing was changed, so try again.",
  },
  declinedNote: "You are not in this hub. You declined its invitation, the owner declined your request, or you withdrew it.",
  joined: "You are in. The brief and the team are now open to you.",
  invitations: { heading: "Invitations", by: "Invited by {name}" },
  ask: {
    heading: "Join the team",
    what: "The owner sees your profile and answers. If they approve, you read the hub's agreement and sign to join.",
    button: "Ask to join",
    asked: "You asked to join. The owner will answer.",
    noHub: "The owner has not opened a hub yet, so there is nothing to join for now. Come back later.",
    member: "You are already in this team.",
    closed: "This idea is no longer looking for people, so its hub takes no requests.",
    withdraw: "Withdraw my request",
    withdrawn: "You withdrew your request. You can ask again whenever you like.",
    answered: "The owner had already answered. This is where you stand now.",
    wait: "The owner turned down your last request. You can ask again from {date}.",
    waitLater: "The owner turned down your last request. You can ask again later.",
    loadFailed: "We couldn't check where you stand with this hub. Nothing was changed, so try again.",
  },
  waiting: { heading: "Waiting for the owner", owner: "Owner: {name}" },
  join: {
    pageTitle: "Join a hub | Village Sqwhere",
    title: "Join {name}",
    lead: "{owner} invited you to build {idea}. Read the terms and the agreement, then sign to join.",
    frozen: "Every member signs these same terms. They cannot be changed.",
    sign: "Sign and join",
    confirm: { title: "Join this hub?", confirm: "Sign and join", cancel: "Go back" },
    send: "We couldn't complete your signature. Nothing you typed was lost, so check your connection and try again.",
    noInvitation: {
      title: "There is no invitation to sign",
      text: "You can only join a hub you were invited to. Ask the owner to invite you.",
    },
    archived: { title: "This hub is archived, so nobody can join.", text: "Nothing was signed." },
    full: {
      title: "The team is full, so you did not join.",
      text: "A hub takes at most five members, and all five places are taken. Nothing was signed.",
    },
  },
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
  notMember: "Vous n'êtes pas membre de cet espace.",
  verified: "Vérifié",
  githubProfile: "profil GitHub, s'ouvre dans un nouvel onglet",
  termsFrozen: "Signées par chaque membre. Elles ne peuvent pas être modifiées.",
  agreementVersion: "Version {n} de l'accord de l'espace",
  phasesHeading: "Phases",
  phases: { brainstorm: "Brainstorm", design: "Conception et architecture", build: "Construction", review: "Revue et tests" },
  phaseStates: { done: "Terminée", in_progress: "En cours", not_started: "Pas commencée" },
  phasesNote: {
    toConfirm: "Confirmez l'équipe quand vous êtes prêt à commencer. Le brainstorm s'ouvre, et vous pourrez encore inviter des personnes ensuite, jusqu'à cinq.",
    waiting: "Les phases s'ouvrent quand le porteur confirme l'équipe.",
    confirmed: "Le porteur fait passer l'espace d'une phase à la suivante. Le brainstorm a ses notes ci-dessous\u202f; les outils des autres phases restent à venir.",
    confirmedOutside: "Le porteur fait passer l'espace d'une phase à la suivante. Les notes du brainstorm sont réservées aux membres de l'espace\u202f; les outils des autres phases restent à venir.",
    archived: "Cet espace est archivé, ses phases ne démarreront donc pas.",
  },
  phaseActions: {
    confirm: {
      button: "Confirmer l'équipe",
      title: "Confirmer l'équipe\u202f?",
      text: "{n} personnes font partie de l'équipe pour le moment. Le brainstorm s'ouvre, et vous pourrez encore inviter des personnes ensuite, jusqu'à cinq.",
      alone: "Vous êtes le seul membre pour le moment. Le brainstorm s'ouvre, et vous pourrez encore inviter des personnes ensuite, jusqu'à cinq.",
      done: "L'équipe est confirmée. Le brainstorm est ouvert.",
    },
    forward: {
      button: "Passer à {phase}",
      title: "Passer à {phase}\u202f?",
      text: "L'espace passe à {phase}. Vous pourrez revenir en arrière.",
      done: "L'espace est maintenant en {phase}.",
    },
    back: {
      button: "Revenir à {phase}",
      title: "Revenir à {phase}\u202f?",
      text: "L'espace revient à {phase}. Rien n'est supprimé.",
      done: "L'espace est revenu à {phase}.",
    },
    cancel: "Annuler",
    errors: {
      changed: "Cet espace a été modifié ailleurs. Voici où il en est maintenant.",
      unavailable: "Cette action n'est pas disponible sur cet espace. Voici où il en est maintenant.",
      failed: "Nous n'avons pas pu l'enregistrer. Rien n'a changé, réessayez.",
    },
  },
  brainstormNotes: {
    heading: "Notes de brainstorm",
    loading: "Chargement des notes",
    loadFailed: "Nous n'avons pas pu charger les notes. Rien n'a été modifié, vérifiez votre connexion et réessayez.",
    empty: "Pas encore de notes. Écrivez la première.",
    emptyAfter: "Aucune note n'a été écrite pendant le brainstorm.",
    over: "Le brainstorm est terminé. Les notes restent ici à lire.",
    archived: "Cet espace est archivé. Les notes restent ici à lire.",
    refresh: "Actualiser",
    refreshed: "Les notes sont à jour.",
    write: {
      label: "Une nouvelle note",
      help: "Texte simple. Tous les membres de l'espace peuvent la lire.",
      left: "Caractères restants\u202f: {n}",
      add: "Ajouter la note",
      added: "Votre note a été ajoutée.",
    },
    delete: {
      label: "Supprimer la note écrite par {name}",
      title: "Supprimer cette note\u202f?",
      text: "La note est supprimée pour tous les membres de l'espace. Cette action est définitive.",
      confirm: "Supprimer la note",
      cancel: "Annuler",
      done: "La note a été supprimée.",
      gone: "Cette note était déjà supprimée.",
    },
    errors: {
      empty: "Écrivez une note avant de l'ajouter.",
      long: "Une note peut contenir {max} caractères au maximum. Raccourcissez-la puis réessayez.",
      changed: "Cet espace a avancé, les notes ne peuvent donc plus être modifiées.",
      full: "Cet espace compte 200 notes, le maximum possible. Supprimez-en une pour en ajouter une autre.",
      notAuthor: "Seul l'auteur de la note ou le porteur de l'espace peut la supprimer.",
      failed: "Nous n'avons pas pu l'enregistrer. Rien n'a changé, réessayez.",
    },
  },
  designSketch: {
    heading: "Schéma de conception",
    loading: "Chargement du schéma",
    loadFailed: "Nous n'avons pas pu charger le schéma. Rien n'a été modifié, vérifiez votre connexion et réessayez.",
    empty: "Pas encore de composants.",
    emptyAfter: "Aucun schéma n'a été réalisé pendant la conception et l'architecture.",
    intro: "Voici le schéma du système réalisé par l'équipe\u202f: ses composants et la façon dont ils communiquent.",
    over: "La conception et l'architecture sont terminées. Le schéma reste ici à lire.",
    archived: "Cet espace est archivé. Le schéma reste ici à lire.",
    refresh: "Actualiser",
    refreshed: "Le schéma est à jour.",
    to: "Vers {piece}\u202f: {label}",
    from: "Depuis {piece}\u202f: {label}",
  },
  missingHub: {
    title: "Nous n'avons pas trouvé cet espace",
    text: "Il a peut-être été supprimé, ou l'adresse est incorrecte.",
  },
  team: {
    requested: "Veut rejoindre",
    invited: "Invité",
    declined: "Refusé",
    approve: "Approuver",
    decline: "Refuser",
    withdraw: "Retirer",
    inviteAgain: "Inviter à nouveau",
    named: "{action}\u202f: {name}",
    approved: "{name} est invité. Cette personne lit l'accord et le signe pour rejoindre l'espace.",
    requestDeclined: "Vous avez refusé la demande de {name}. Vous pourrez l'inviter plus tard.",
    requestGone: "Cette demande n'attend plus de réponse. La liste est à jour.",
    declineDialog: {
      title: "Refuser cette demande\u202f?",
      text: "Cette personne pourra demander à nouveau plus tard, et vous pourrez l'inviter.",
      confirm: "Refuser",
      cancel: "Revenir",
    },
    withdrawDialog: {
      title: "Retirer cette invitation\u202f?",
      text: "Cette personne pourra être invitée à nouveau plus tard.",
      confirm: "Retirer l'invitation",
      cancel: "La garder",
    },
    loadFailed: "Nous n'avons pas pu charger l'équipe. Rien n'a été modifié, vérifiez votre connexion et réessayez.",
    actionFailed: "Cela n'a pas abouti. Rien n'a été modifié, réessayez.",
    full: "L'équipe est complète\u202f: cinq membres, c'est le maximum pour un espace.",
    findMatches: "Trouver des développeurs qui correspondent à cette idée",
    form: {
      label: "Nom d'utilisateur GitHub",
      help: "Le développeur doit s'être connecté une fois à Village Sqwhere.",
      send: "Envoyer l'invitation",
      sent: "Invitation envoyée à {name}.",
    },
    errors: {
      notFound:
        "Aucun développeur ici n'a ce nom d'utilisateur. Vérifiez l'orthographe, ou demandez-lui de se connecter d'abord à Village Sqwhere.",
      alreadyMember: "Cette personne est déjà dans cet espace.",
      alreadyInvited: "Cette personne a déjà une invitation.",
      archived: "Cet espace est archivé, personne ne peut donc être invité.",
      invalid: "Saisissez un nom d'utilisateur GitHub, par exemple ada-obi.",
      failed: "L'invitation n'a pas été envoyée. Ce que vous avez saisi est toujours là, vérifiez votre connexion et réessayez.",
    },
  },
  brief: {
    heading: "Le brief",
    private: "Seule l'équipe voit ceci.",
    empty: "Le porteur n'a pas encore rédigé de brief.",
    write: "Rédiger le brief",
    loadFailed: "Nous n'avons pas pu charger le brief. Rien n'a été modifié, réessayez.",
  },
  invitation: {
    title: "Une invitation à cet espace vous attend.",
    text: "Lisez l'accord et les conditions, puis signez pour rejoindre l'espace. Tant que vous n'avez pas signé, vous ne pouvez pas lire le brief.",
    sign: "Lire et signer",
    decline: "Refuser",
    dialog: {
      title: "Refuser cette invitation\u202f?",
      text: "Le porteur pourra vous inviter à nouveau plus tard.",
      confirm: "Refuser",
      cancel: "Revenir",
    },
    failed: "Nous n'avons pas pu refuser l'invitation. Rien n'a été modifié, réessayez.",
  },
  declinedNote: "Vous n'êtes pas dans cet espace. Vous avez refusé son invitation, le porteur a refusé votre demande, ou vous l'avez retirée.",
  joined: "C'est fait, vous êtes dans l'équipe. Le brief et l'équipe vous sont maintenant ouverts.",
  invitations: { heading: "Invitations", by: "Invitation de {name}" },
  ask: {
    heading: "Rejoindre l'équipe",
    what: "Le porteur voit votre profil et vous répond. S'il accepte, vous lisez l'accord de l'espace et le signez pour rejoindre l'équipe.",
    button: "Demander à rejoindre",
    asked: "Vous avez demandé à rejoindre l'équipe. Le porteur vous répondra.",
    noHub: "Le porteur n'a pas encore ouvert d'espace, il n'y a donc rien à rejoindre pour l'instant. Revenez plus tard.",
    member: "Vous êtes déjà dans cette équipe.",
    closed: "Cette idée ne recherche plus personne, son espace n'accepte donc plus de demandes.",
    withdraw: "Retirer ma demande",
    withdrawn: "Vous avez retiré votre demande. Vous pouvez redemander quand vous voulez.",
    answered: "Le porteur avait déjà répondu. Voici où vous en êtes.",
    wait: "Le porteur a refusé votre dernière demande. Vous pourrez redemander à partir du {date}.",
    waitLater: "Le porteur a refusé votre dernière demande. Vous pourrez redemander plus tard.",
    loadFailed: "Nous n'avons pas pu vérifier où vous en êtes avec cet espace. Rien n'a été modifié, réessayez.",
  },
  waiting: { heading: "En attente du porteur", owner: "Porteur\u202f: {name}" },
  join: {
    pageTitle: "Rejoindre un espace | Village Sqwhere",
    title: "Rejoindre {name}",
    lead: "{owner} vous invite à construire {idea}. Lisez les conditions et l'accord, puis signez pour rejoindre l'espace.",
    frozen: "Chaque membre signe ces mêmes conditions. Elles ne peuvent pas être modifiées.",
    sign: "Signer et rejoindre",
    confirm: { title: "Rejoindre cet espace\u202f?", confirm: "Signer et rejoindre", cancel: "Revenir" },
    send: "Nous n'avons pas pu enregistrer votre signature. Rien de ce que vous avez saisi n'est perdu, vérifiez votre connexion et réessayez.",
    noInvitation: {
      title: "Aucune invitation à signer",
      text: "On ne peut rejoindre qu'un espace où l'on est invité. Demandez au porteur de vous inviter.",
    },
    archived: { title: "Cet espace est archivé, personne ne peut donc le rejoindre.", text: "Rien n'a été signé." },
    full: {
      title: "L'équipe est complète, vous ne l'avez donc pas rejointe.",
      text: "Un espace compte au plus cinq membres, et les cinq places sont prises. Rien n'a été signé.",
    },
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
