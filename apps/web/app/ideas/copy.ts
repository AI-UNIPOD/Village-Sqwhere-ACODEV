import type { Lang } from "../locales";

type Field = { label: string; help: string };
type Confirm = { title: string; text: string; confirm: string; cancel: string };

type Copy = {
  mineTitle: string;
  minePageTitle: string;
  mineLead: string;
  newIdea: string;
  emptyTitle: string;
  emptyText: string;
  status: { draft: string; open: string; closed: string };
  stage: { concept: string; prototype: string; building: string };
  stageHint: { concept: string; prototype: string; building: string };
  rolesNeeded: string;
  noRoles: string;
  updated: string;
  loadMore: string;
  donePublished: string;
  doneClosed: string;
  newTitle: string;
  editTitle: string;
  closedTitle: string;
  composePageTitle: string;
  back: string;
  publicHeading: string;
  publicLead: string;
  privateHeading: string;
  privateLead: string;
  needsHeading: string;
  needsLead: string;
  title: Field;
  summary: Field;
  details: Field;
  stageLabel: string;
  roles: Field;
  count: string;
  saveDraft: string;
  saveChanges: string;
  publish: string;
  close: string;
  saved: string;
  closedNote: string;
  publishConfirm: Confirm & { noRoles: string };
  closeConfirm: Confirm;
  errors: {
    titleShort: string;
    titleLong: string;
    summaryShort: string;
    summaryLong: string;
    detailsLong: string;
    roles: string;
    save: string;
    notFoundTitle: string;
    notFoundText: string;
  };
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
  browse: {
    pageTitle: string;
    title: string;
    lead: string;
    tabs: string;
    tabOpen: string;
    tabForYou: string;
    tabMine: string;
    by: string;
    verified: string;
    published: string;
    yours: string;
    fitNeeds: string;
    fitVerify: string;
    fitVerifyWhy: string;
    moreFailed: string;
    emptyTitle: string;
    emptyText: string;
  };
  seeMatches: string;
  matches: {
    pageTitle: string;
    title: string;
    lead: string;
    verifiedIn: string;
    techOne: string;
    techMany: string;
    technologies: string;
    invite: string;
    noHubTitle: string;
    noHubText: string;
    moreFailed: string;
    notOpenTitle: string;
    notOpenText: string;
    notOpenAction: string;
    closedTitle: string;
    closedText: string;
    noRolesTitle: string;
    noRolesText: string;
    noRolesAction: string;
    noneTitle: string;
    noneText: string;
    noneAction: string;
  };
  forYou: {
    pageTitle: string;
    title: string;
    lead: string;
    whyOne: string;
    whyMany: string;
    emptyTitle: string;
    emptyText: string;
    emptyAction: string;
    unverifiedTitle: string;
    unverifiedText: string;
    verify: string;
    noProfileTitle: string;
    noProfileText: string;
    setUp: string;
  };
  open: {
    pageTitle: string;
    back: string;
    noRoles: string;
    sharedBy: string;
    githubProfile: string;
    joinTitle: string;
    joinSteps: string[];
    edit: string;
    fitNote: string;
    verify: string;
    verifyWhy: string;
    setUp: string;
    setUpWhy: string;
    otherRoles: string;
    goneTitle: string;
    goneText: string;
  };
};

const en: Copy = {
  mineTitle: "Your ideas",
  minePageTitle: "Your ideas | Village Sqwhere",
  mineLead: "Drafts stay private. An open idea shows its title and summary to signed-in developers.",
  newIdea: "Share an idea",
  emptyTitle: "No ideas yet",
  emptyText:
    "Say what you want to build and which roles it is missing. You can keep it as a private draft until it is ready.",
  status: { draft: "Draft", open: "Open", closed: "Closed" },
  stage: { concept: "Concept", prototype: "Prototype", building: "Building" },
  stageHint: {
    concept: "An idea, nothing built yet",
    prototype: "Something runs, however rough",
    building: "Work is under way",
  },
  rolesNeeded: "Roles needed",
  noRoles: "No roles chosen",
  updated: "Updated {date}",
  loadMore: "Show more",
  donePublished: "Your idea is open. Signed-in developers can now find it.",
  doneClosed: "Your idea is closed. It no longer shows to other developers.",
  newTitle: "Share an idea",
  editTitle: "Edit your idea",
  closedTitle: "A closed idea",
  composePageTitle: "Your idea | Village Sqwhere",
  back: "Your ideas",
  publicHeading: "What everyone sees",
  publicLead:
    "Once you publish, signed-in developers read this before they ask to join. Leave out anything you want kept private.",
  privateHeading: "Only you see this",
  privateLead:
    "The full brief stays private. Team members will read it only after they sign the hub agreement.",
  needsHeading: "What the idea needs",
  needsLead: "The matcher uses these to suggest developers whose verified role fills a gap.",
  title: { label: "Title", help: "5 to 150 characters. Say what it is, for example: Offline farm ledger for co-operatives." },
  summary: {
    label: "Public summary",
    help: "20 to 1,000 characters. The problem, who has it, and what you want to build.",
  },
  details: {
    label: "Private brief (optional)",
    help: "Your plan, what exists already, what you have tried. Up to 20,000 characters.",
  },
  stageLabel: "Where is it today?",
  roles: { label: "Which roles is it missing?", help: "Pick every role you need on the team. You can change this later." },
  count: "{n} of {max}",
  saveDraft: "Save draft",
  saveChanges: "Save changes",
  publish: "Publish",
  close: "Close this idea",
  saved: "Saved",
  closedNote: "This idea is closed. It cannot be edited or opened again.",
  publishConfirm: {
    title: "Publish this idea?",
    text: "Its title, summary, stage and roles become visible to signed-in developers. The private brief stays private.",
    noRoles: "You have not chosen any roles, so the matcher cannot suggest anyone yet.",
    confirm: "Publish the idea",
    cancel: "Not yet",
  },
  closeConfirm: {
    title: "Close this idea?",
    text: "It stops showing to other developers and to the matcher. A closed idea cannot be opened again.",
    confirm: "Close the idea",
    cancel: "Keep it open",
  },
  errors: {
    titleShort: "Give the title at least 5 characters.",
    titleLong: "Shorten the title to 150 characters or fewer.",
    summaryShort: "Write at least 20 characters, so developers know what the idea is.",
    summaryLong: "Shorten the summary to 1,000 characters or fewer.",
    detailsLong: "Shorten the brief to 20,000 characters or fewer.",
    roles: "One of these roles is no longer offered. Untick it and save again.",
    save: "We couldn't save your idea. Your text is still here, so check your connection and try again.",
    notFoundTitle: "We couldn't find this idea",
    notFoundText: "It may have been removed, or it belongs to another account.",
  },
  loading: "Getting your ideas",
  errorTitle: "We couldn't show your ideas",
  errorText:
    "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
  browse: {
    pageTitle: "Open ideas | Village Sqwhere",
    title: "Open ideas",
    lead: "Ideas looking for co-builders. You see the public summary; the full brief stays with the team.",
    tabs: "Ideas",
    tabOpen: "Open ideas",
    tabForYou: "For you",
    tabMine: "Your ideas",
    by: "by {name}",
    verified: "Verified",
    published: "Published {date}",
    yours: "Yours",
    fitNeeds: "Needs your role: {role}",
    fitVerify: "Verify it",
    fitVerifyWhy: "to be suggested to the owner.",
    moreFailed: "We couldn't load more ideas. The ones above are still here, so try again.",
    emptyTitle: "No open ideas yet",
    emptyText: "Be the first: share what you want to build.",
  },
  seeMatches: "See who matches",
  matches: {
    pageTitle: "Developers who match your idea | Village Sqwhere",
    title: "Who matches {title}",
    lead: "Developers verified in a role your idea needs. Each one shows why they matched.",
    verifiedIn: "Verified in: {roles}",
    techOne: "1 technology in common with you",
    techMany: "{n} technologies in common with you",
    technologies: "Technologies",
    invite: "Invite to the hub",
    noHubTitle: "You need a hub to invite",
    noHubText:
      "Invitations go through your idea's hub, where the team signs the agreement and builds together. Create it, then come back to invite these developers.",
    moreFailed: "We couldn't load more developers. The ones above are still here, so try again.",
    notOpenTitle: "Publish the idea to see who matches",
    notOpenText:
      "Matching only runs for an open idea. Publish yours and the developers verified in the roles it needs show up here.",
    notOpenAction: "Open your idea",
    closedTitle: "This idea is closed",
    closedText: "A closed idea is no longer matched, and it cannot be opened again.",
    noRolesTitle: "This idea names no roles yet",
    noRolesText:
      "Matching goes by the roles an idea needs. Add the roles it is missing and the developers verified in them show up here.",
    noRolesAction: "Add roles",
    noneTitle: "No verified developer holds these roles yet",
    noneText:
      "The list fills as developers verify their roles. You can already invite someone you know by their GitHub username.",
    noneAction: "Invite by GitHub username",
  },
  forYou: {
    pageTitle: "Ideas that need you | Village Sqwhere",
    title: "Ideas that need you",
    lead: "Open ideas that need a role you are verified in. Each one says which role.",
    whyOne: "Needs your verified role: {roles}",
    whyMany: "Needs your verified roles: {roles}",
    emptyTitle: "No open idea needs your role yet",
    emptyText:
      "New ideas show up here when their owners say they need a role you are verified in. Until then, you can read every open idea.",
    emptyAction: "See all open ideas",
    unverifiedTitle: "Verify a role to see the ideas that need you",
    unverifiedText:
      "Ideas are matched to verified roles, not to roles you only claim. Verify yours and the ideas that need it show up here.",
    verify: "Verify my role",
    noProfileTitle: "Set up your profile first",
    noProfileText:
      "Ideas are matched to verified roles. Choose your main role, then verify it, and the ideas that need it show up here.",
    setUp: "Set up my profile",
  },
  open: {
    pageTitle: "An open idea | Village Sqwhere",
    back: "Open ideas",
    noRoles: "The owner has not said which roles are needed yet.",
    sharedBy: "Shared by",
    githubProfile: "GitHub profile, opens in a new tab",
    joinTitle: "How joining works",
    joinSteps: [
      "The owner sees developers whose verified role fills a gap.",
      "The owner invites the people they want on the team, 2 to 5 in all.",
      "Invited developers sign the hub agreement, then read the full brief and build together.",
    ],
    edit: "Edit your idea",
    fitNote: "You are verified in a role this idea needs, so the owner can be shown your profile.",
    verify: "Verify your role",
    verifyWhy: "Owners are only shown developers whose role is verified.",
    setUp: "Set up your profile",
    setUpWhy: "Choose your main role first, so ideas that need it can find you.",
    otherRoles: "This idea needs other roles than yours.",
    goneTitle: "This idea is not open",
    goneText: "It may have been closed by its owner, or the address is wrong.",
  },
};

// Needs a native French review before launch.
const fr: Copy = {
  mineTitle: "Vos idées",
  minePageTitle: "Vos idées | Village Sqwhere",
  mineLead:
    "Les brouillons restent privés. Une idée ouverte montre son titre et son résumé aux développeurs connectés.",
  newIdea: "Partager une idée",
  emptyTitle: "Pas encore d'idée",
  emptyText:
    "Dites ce que vous voulez construire et quels rôles manquent. Vous pouvez la garder en brouillon privé jusqu'à ce qu'elle soit prête.",
  status: { draft: "Brouillon", open: "Ouverte", closed: "Fermée" },
  stage: { concept: "Concept", prototype: "Prototype", building: "En construction" },
  stageHint: {
    concept: "Une idée, rien n'est encore construit",
    prototype: "Quelque chose fonctionne, même imparfait",
    building: "Le travail est en cours",
  },
  rolesNeeded: "Rôles recherchés",
  noRoles: "Aucun rôle choisi",
  updated: "Modifiée le {date}",
  loadMore: "Afficher plus",
  donePublished: "Votre idée est ouverte. Les développeurs connectés peuvent maintenant la trouver.",
  doneClosed: "Votre idée est fermée. Elle n'est plus montrée aux autres développeurs.",
  newTitle: "Partager une idée",
  editTitle: "Modifier votre idée",
  closedTitle: "Une idée fermée",
  composePageTitle: "Votre idée | Village Sqwhere",
  back: "Vos idées",
  publicHeading: "Ce que tout le monde voit",
  publicLead:
    "Après publication, les développeurs connectés lisent ceci avant de demander à rejoindre l'équipe. N'y mettez rien que vous voulez garder privé.",
  privateHeading: "Vous seul voyez ceci",
  privateLead:
    "Le dossier complet reste privé. Les membres de l'équipe ne le liront qu'après avoir signé l'accord de l'espace.",
  needsHeading: "Ce dont l'idée a besoin",
  needsLead:
    "Le matcher s'en sert pour proposer des développeurs dont le rôle vérifié comble un manque.",
  title: {
    label: "Titre",
    help: "De 5 à 150 caractères. Dites ce que c'est, par exemple\u202f: Registre agricole hors ligne pour coopératives.",
  },
  summary: {
    label: "Résumé public",
    help: "De 20 à 1\u202f000 caractères. Le problème, qui le rencontre, et ce que vous voulez construire.",
  },
  details: {
    label: "Dossier privé (facultatif)",
    help: "Votre plan, ce qui existe déjà, ce que vous avez essayé. Jusqu'à 20\u202f000 caractères.",
  },
  stageLabel: "Où en est-elle aujourd'hui\u202f?",
  roles: {
    label: "Quels rôles lui manquent\u202f?",
    help: "Choisissez tous les rôles dont l'équipe a besoin. Vous pourrez changer cela plus tard.",
  },
  count: "{n} sur {max}",
  saveDraft: "Enregistrer le brouillon",
  saveChanges: "Enregistrer les modifications",
  publish: "Publier",
  close: "Fermer cette idée",
  saved: "Enregistré",
  closedNote: "Cette idée est fermée. Elle ne peut plus être modifiée ni rouverte.",
  publishConfirm: {
    title: "Publier cette idée\u202f?",
    text: "Son titre, son résumé, son stade et ses rôles deviennent visibles pour les développeurs connectés. Le dossier privé reste privé.",
    noRoles: "Vous n'avez choisi aucun rôle, le matcher ne peut donc proposer personne pour l'instant.",
    confirm: "Publier l'idée",
    cancel: "Pas encore",
  },
  closeConfirm: {
    title: "Fermer cette idée\u202f?",
    text: "Elle n'est plus montrée aux autres développeurs ni au matcher. Une idée fermée ne peut pas être rouverte.",
    confirm: "Fermer l'idée",
    cancel: "La garder ouverte",
  },
  errors: {
    titleShort: "Donnez au titre au moins 5 caractères.",
    titleLong: "Raccourcissez le titre à 150 caractères au plus.",
    summaryShort: "Écrivez au moins 20 caractères, pour que les développeurs comprennent l'idée.",
    summaryLong: "Raccourcissez le résumé à 1\u202f000 caractères au plus.",
    detailsLong: "Raccourcissez le dossier à 20\u202f000 caractères au plus.",
    roles: "L'un de ces rôles n'est plus proposé. Décochez-le et enregistrez à nouveau.",
    save: "Nous n'avons pas pu enregistrer votre idée. Votre texte est toujours là, vérifiez votre connexion et réessayez.",
    notFoundTitle: "Nous n'avons pas trouvé cette idée",
    notFoundText: "Elle a peut-être été supprimée, ou elle appartient à un autre compte.",
  },
  loading: "Chargement de vos idées",
  errorTitle: "Nous n'avons pas pu afficher vos idées",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela se reproduit, revenez dans quelques minutes.",
  retry: "Réessayer",
  browse: {
    pageTitle: "Idées ouvertes | Village Sqwhere",
    title: "Idées ouvertes",
    lead: "Des idées qui cherchent des partenaires. Vous voyez le résumé public\u202f; le dossier complet reste dans l'équipe.",
    tabs: "Idées",
    tabOpen: "Idées ouvertes",
    tabForYou: "Pour vous",
    tabMine: "Vos idées",
    by: "par {name}",
    verified: "Vérifié",
    published: "Publiée le {date}",
    yours: "La vôtre",
    fitNeeds: "Recherche votre rôle\u202f: {role}",
    fitVerify: "Faites-le vérifier",
    fitVerifyWhy: "pour être proposé au porteur de l'idée.",
    moreFailed: "Nous n'avons pas pu charger plus d'idées. Celles du dessus sont toujours là, vous pouvez réessayer.",
    emptyTitle: "Pas encore d'idée ouverte",
    emptyText: "Lancez-vous en premier\u202f: partagez ce que vous voulez construire.",
  },
  seeMatches: "Voir qui correspond",
  matches: {
    pageTitle: "Développeurs qui correspondent à votre idée | Village Sqwhere",
    title: "Qui correspond à {title}",
    lead: "Des développeurs vérifiés dans un rôle que votre idée recherche. Chacun montre pourquoi il correspond.",
    verifiedIn: "Vérifié dans\u202f: {roles}",
    techOne: "1 technologie en commun avec vous",
    techMany: "{n} technologies en commun avec vous",
    technologies: "Technologies",
    invite: "Inviter dans l'espace",
    noHubTitle: "Il faut un espace pour inviter",
    noHubText:
      "Les invitations passent par l'espace de votre idée, où l'équipe signe l'accord et construit ensemble. Créez-le, puis revenez inviter ces développeurs.",
    moreFailed: "Nous n'avons pas pu charger plus de développeurs. Ceux du dessus sont toujours là, vous pouvez réessayer.",
    notOpenTitle: "Publiez l'idée pour voir qui correspond",
    notOpenText:
      "La recherche ne porte que sur une idée ouverte. Publiez la vôtre et les développeurs vérifiés dans les rôles qu'elle recherche apparaîtront ici.",
    notOpenAction: "Ouvrir votre idée",
    closedTitle: "Cette idée est fermée",
    closedText: "Une idée fermée n'est plus mise en correspondance et ne peut pas être rouverte.",
    noRolesTitle: "Cette idée n'indique encore aucun rôle",
    noRolesText:
      "La recherche se fait selon les rôles qu'une idée recherche. Ajoutez ceux qui lui manquent et les développeurs vérifiés dans ces rôles apparaîtront ici.",
    noRolesAction: "Ajouter des rôles",
    noneTitle: "Aucun développeur vérifié n'a encore ces rôles",
    noneText:
      "La liste se remplit à mesure que les développeurs font vérifier leur rôle. Vous pouvez déjà inviter quelqu'un que vous connaissez avec son nom d'utilisateur GitHub.",
    noneAction: "Inviter avec un nom d'utilisateur GitHub",
  },
  forYou: {
    pageTitle: "Idées qui ont besoin de vous | Village Sqwhere",
    title: "Idées qui ont besoin de vous",
    lead: "Des idées ouvertes qui recherchent un rôle dans lequel vous êtes vérifié. Chacune dit lequel.",
    whyOne: "Recherche votre rôle vérifié\u202f: {roles}",
    whyMany: "Recherche vos rôles vérifiés\u202f: {roles}",
    emptyTitle: "Aucune idée ouverte ne recherche encore votre rôle",
    emptyText:
      "Les nouvelles idées apparaissent ici quand leurs porteurs disent chercher un rôle dans lequel vous êtes vérifié. En attendant, vous pouvez lire toutes les idées ouvertes.",
    emptyAction: "Voir toutes les idées ouvertes",
    unverifiedTitle: "Faites vérifier un rôle pour voir les idées qui ont besoin de vous",
    unverifiedText:
      "Les idées sont associées aux rôles vérifiés, pas aux rôles simplement déclarés. Faites vérifier le vôtre et les idées qui le recherchent apparaîtront ici.",
    verify: "Faire vérifier mon rôle",
    noProfileTitle: "Configurez d'abord votre profil",
    noProfileText:
      "Les idées sont associées aux rôles vérifiés. Choisissez votre rôle principal, puis faites-le vérifier\u202f: les idées qui le recherchent apparaîtront ici.",
    setUp: "Configurer mon profil",
  },
  open: {
    pageTitle: "Une idée ouverte | Village Sqwhere",
    back: "Idées ouvertes",
    noRoles: "Le porteur de l'idée n'a pas encore indiqué les rôles recherchés.",
    sharedBy: "Partagée par",
    githubProfile: "profil GitHub, s'ouvre dans un nouvel onglet",
    joinTitle: "Comment rejoindre une équipe",
    joinSteps: [
      "Le porteur de l'idée voit les développeurs dont le rôle vérifié comble un manque.",
      "Il invite les personnes qu'il veut dans l'équipe, de 2 à 5 en tout.",
      "Les développeurs invités signent l'accord de l'espace, puis lisent le dossier complet et construisent ensemble.",
    ],
    edit: "Modifier votre idée",
    fitNote: "Vous êtes vérifié dans un rôle que cette idée recherche\u202f: votre profil peut être proposé à son porteur.",
    verify: "Faire vérifier votre rôle",
    verifyWhy: "Seuls les développeurs au rôle vérifié sont proposés aux porteurs d'idées.",
    setUp: "Configurer votre profil",
    setUpWhy: "Choisissez d'abord votre rôle principal, pour que les idées qui le recherchent vous trouvent.",
    otherRoles: "Cette idée recherche d'autres rôles que le vôtre.",
    goneTitle: "Cette idée n'est pas ouverte",
    goneText: "Elle a peut-être été fermée par son porteur, ou l'adresse est incorrecte.",
  },
};

export const copy: Record<Lang, Copy> = { en, fr };
