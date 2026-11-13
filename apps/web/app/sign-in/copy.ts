import type { Lang } from "../locales";

export type ProblemKey =
  | "network"
  | "notConfigured"
  | "other"
  | "invalidState"
  | "accessDenied"
  | "exchangeFailed";

type Problem = { title: string; text: string };

type Copy = {
  pageTitle: string;
  heading: string;
  intro: string;
  button: string;
  scope: string;
  join: string;
  working: string;
  retry: string;
  stepsLabel: string;
  steps: { approve: string; back: string };
  stepState: { todo: string; active: string; done: string; failed: string };
  problems: Record<ProblemKey, Problem>;
};

const en: Copy = {
  pageTitle: "Sign in | Village Sqwhere",
  heading: "Sign in to the village",
  intro:
    "Find developers who want to build what you want to build. New here? The same button creates your account.",
  button: "Continue with GitHub",
  scope: "We read your GitHub profile and email address only.",
  join: "No GitHub account? Create one on GitHub",
  working: "Taking you to GitHub…",
  retry: "Try again",
  stepsLabel: "How signing in works",
  steps: { approve: "GitHub asks you to approve", back: "You come back signed in" },
  stepState: { todo: "to do", active: "in progress", done: "done", failed: "failed" },
  problems: {
    network: {
      title: "We couldn't reach Village Sqwhere",
      text: "The connection dropped before sign-in could start. Check your network, then try again.",
    },
    notConfigured: {
      title: "GitHub sign-in isn't ready yet",
      text: "It is not set up on this server yet. Try again later, or tell the team if you run this server.",
    },
    other: {
      title: "Sign-in didn't start",
      text: "Something went wrong on our side. Nothing was changed. Try again in a moment.",
    },
    invalidState: {
      title: "That sign-in expired",
      text: "It took too long, or it was opened twice. You are not signed in. Try again to start fresh.",
    },
    accessDenied: {
      title: "Sign-in was cancelled",
      text: "You cancelled on GitHub, or GitHub did not approve it. You are not signed in. Try again when you are ready.",
    },
    exchangeFailed: {
      title: "We couldn't finish with GitHub",
      text: "Nothing was saved and you are not signed in. Try again in a moment.",
    },
  },
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Connexion | Village Sqwhere",
  heading: "Connectez-vous au village",
  intro:
    "Trouvez des développeurs qui veulent construire ce que vous voulez construire. Nouveau ici\u202f? Le même bouton crée votre compte.",
  button: "Continuer avec GitHub",
  scope: "Nous lisons uniquement votre profil GitHub et votre adresse e\u2011mail.",
  join: "Pas de compte GitHub\u202f? Créez-en un sur GitHub",
  working: "Redirection vers GitHub…",
  retry: "Réessayer",
  stepsLabel: "Comment fonctionne la connexion",
  steps: { approve: "GitHub vous demande de valider", back: "Vous revenez ici, connexion faite" },
  stepState: { todo: "à faire", active: "en cours", done: "terminé", failed: "échec" },
  problems: {
    network: {
      title: "Nous n'avons pas pu joindre Village Sqwhere",
      text: "Le réseau a été coupé avant le début de la connexion. Vérifiez votre réseau, puis réessayez.",
    },
    notConfigured: {
      title: "La connexion avec GitHub n'est pas encore prête",
      text: "Elle n'est pas encore configurée sur ce serveur. Réessayez plus tard, ou prévenez l'équipe si vous gérez ce serveur.",
    },
    other: {
      title: "La connexion n'a pas démarré",
      text: "Un problème est survenu de notre côté. Rien n'a été modifié. Réessayez dans un instant.",
    },
    invalidState: {
      title: "Cette connexion a expiré",
      text: "Elle a pris trop de temps, ou elle a été ouverte deux fois. Vous n'êtes pas connecté. Réessayez pour repartir de zéro.",
    },
    accessDenied: {
      title: "La connexion a été annulée",
      text: "Vous avez annulé sur GitHub, ou GitHub ne l'a pas validée. Vous n'êtes pas connecté. Réessayez quand vous le voulez.",
    },
    exchangeFailed: {
      title: "Nous n'avons pas pu terminer avec GitHub",
      text: "Rien n'a été enregistré et vous n'êtes pas connecté. Réessayez dans un instant.",
    },
  },
};

export const copy: Record<Lang, Copy> = { en, fr };
