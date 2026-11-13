import type { Lang } from "../locales";

type Step = { title: string; text: string };

type Copy = {
  pageTitle: string;
  title: string;
  noRole: string;
  verified: string;
  notVerified: string;
  stackLabel: string;
  githubProfile: string;
  pathTitle: string;
  pathLead: string;
  done: string;
  next: string;
  open: string;
  later: string;
  steps: { profile: Step; verify: Step; idea: Step; hub: Step };
  setUp: string;
  change: string;
  verifyStart: string;
  verifyContinue: string;
  review: string;
  ideas: string;
  browse: string;
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
};

const en: Copy = {
  pageTitle: "Your village | Village Sqwhere",
  title: "Good to see you, {name}.",
  noRole: "No role chosen yet",
  verified: "Verified",
  notVerified: "Not verified yet",
  stackLabel: "Stack",
  githubProfile: "GitHub profile, opens in a new tab",
  pathTitle: "From here to a team",
  pathLead: "Four steps take you from a profile to building with a team. This is where you are.",
  done: "Done",
  next: "Next",
  open: "Open",
  later: "Later",
  steps: {
    profile: {
      title: "Set up your profile",
      text: "Your main role and your stack decide which ideas and teams we suggest to you.",
    },
    verify: {
      title: "Earn your Green Tick",
      text: "Idea owners are only shown developers whose role is verified. It takes a check of your repositories, five questions and a review by a verified peer.",
    },
    idea: {
      title: "Share an idea, or join one",
      text: "Say what you want to build and which roles it is missing, or pick an idea that needs your role.",
    },
    hub: {
      title: "Build together in a hub",
      text: "The idea's owner approves a team of 2 to 5. You build in four phases: brainstorm, design, build, then review.",
    },
  },
  setUp: "Set up my profile",
  change: "Change my answers",
  verifyStart: "Start verification",
  verifyContinue: "See where it stands",
  review: "Review attempts in your role",
  ideas: "Share an idea",
  browse: "Browse open ideas",
  loading: "Opening your village",
  errorTitle: "We couldn't open your village",
  errorText:
    "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Votre village | Village Sqwhere",
  title: "Ravis de vous voir, {name}.",
  noRole: "Aucun rôle choisi pour l'instant",
  verified: "Vérifié",
  notVerified: "Pas encore vérifié",
  stackLabel: "Technologies",
  githubProfile: "profil GitHub, s'ouvre dans un nouvel onglet",
  pathTitle: "D'ici à une équipe",
  pathLead: "Quatre étapes mènent d'un profil à une équipe qui construit. Voici où vous en êtes.",
  done: "Fait",
  next: "À faire",
  open: "Ouverte",
  later: "Plus tard",
  steps: {
    profile: {
      title: "Configurer votre profil",
      text: "Votre rôle principal et vos technologies déterminent les idées et les équipes que nous vous proposons.",
    },
    verify: {
      title: "Obtenir votre Green Tick",
      text: "Seuls les développeurs au rôle vérifié sont proposés aux porteurs d'idées. Il faut une analyse de vos dépôts, cinq questions et la revue d'un pair vérifié.",
    },
    idea: {
      title: "Partager une idée, ou en rejoindre une",
      text: "Dites ce que vous voulez construire et quels rôles manquent, ou choisissez une idée qui a besoin du vôtre.",
    },
    hub: {
      title: "Construire ensemble dans un espace",
      text: "Le porteur de l'idée valide une équipe de 2 à 5 personnes. Vous construisez en quatre phases\u202f: brainstorm, conception, construction, puis revue.",
    },
  },
  setUp: "Configurer mon profil",
  change: "Modifier mes réponses",
  verifyStart: "Commencer la vérification",
  verifyContinue: "Voir où en est la vérification",
  review: "Relire des tentatives dans votre rôle",
  ideas: "Partager une idée",
  browse: "Parcourir les idées ouvertes",
  loading: "Ouverture de votre village",
  errorTitle: "Nous n'avons pas pu ouvrir votre village",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela se reproduit, revenez dans quelques minutes.",
  retry: "Réessayer",
};

export const copy: Record<Lang, Copy> = { en, fr };
