import type { Lang } from "../locales";

export type ProblemKey = "noCode" | "noVerifier" | "refused" | "network" | "other";

type Message = { title: string; text: string };

type Copy = {
  pageTitle: string;
  loading: Message;
  success: Message;
  retry: string;
  problems: Record<ProblemKey, Message & { link: string }>;
};

const en: Copy = {
  pageTitle: "Finishing sign-in | Village Sqwhere",
  loading: { title: "Finishing sign-in", text: "This takes a moment. Please stay on this page." },
  success: { title: "You're signed in", text: "Taking you to your profile" },
  retry: "Try again",
  problems: {
    noCode: {
      title: "This sign-in link is incomplete",
      text: "It is missing the code we send once GitHub approves you. You are not signed in. Start again from the sign-in page.",
      link: "Back to sign-in",
    },
    noVerifier: {
      title: "We lost track of this sign-in",
      text: "Sign-in has to start and finish in the same browser, and this one has no record of starting it. The link may have opened in another browser or tab, or its data was cleared. You are not signed in. Start again here.",
      link: "Sign in again",
    },
    refused: {
      title: "That sign-in link expired",
      text: "It ran out of time, or it was already used. You are not signed in. Start again to get a fresh link.",
      link: "Sign in again",
    },
    network: {
      title: "We couldn't reach Village Sqwhere",
      text: "The connection dropped before sign-in could finish. Check your network, then try again. If it keeps failing, start again from the sign-in page.",
      link: "Back to sign-in",
    },
    other: {
      title: "Sign-in didn't finish",
      text: "Something went wrong on our side. Nothing was saved and you are not signed in. Start again in a moment.",
      link: "Sign in again",
    },
  },
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Finalisation de la connexion | Village Sqwhere",
  loading: { title: "Finalisation de la connexion", text: "Cela prend un instant. Restez sur cette page." },
  success: { title: "Vous êtes connecté", text: "Nous vous emmenons vers votre profil" },
  retry: "Réessayer",
  problems: {
    noCode: {
      title: "Ce lien de connexion est incomplet",
      text: "Il ne contient pas le code que nous envoyons une fois que GitHub vous a validé. Vous n'êtes pas connecté. Reprenez depuis la page de connexion.",
      link: "Retour à la connexion",
    },
    noVerifier: {
      title: "Nous avons perdu le fil de cette connexion",
      text: "La connexion doit commencer et se terminer dans le même navigateur, et celui-ci n'a aucune trace de son début. Le lien s'est peut-être ouvert dans un autre navigateur ou un autre onglet, ou ses données ont été effacées. Vous n'êtes pas connecté. Recommencez ici.",
      link: "Se reconnecter",
    },
    refused: {
      title: "Ce lien de connexion a expiré",
      text: "Le délai est dépassé, ou le lien a déjà été utilisé. Vous n'êtes pas connecté. Recommencez pour obtenir un nouveau lien.",
      link: "Se reconnecter",
    },
    network: {
      title: "Nous n'avons pas pu joindre Village Sqwhere",
      text: "Le réseau a été coupé avant la fin de la connexion. Vérifiez votre réseau, puis réessayez. Si cela échoue encore, reprenez depuis la page de connexion.",
      link: "Retour à la connexion",
    },
    other: {
      title: "La connexion n'a pas abouti",
      text: "Un problème est survenu de notre côté. Rien n'a été enregistré et vous n'êtes pas connecté. Recommencez dans un instant.",
      link: "Se reconnecter",
    },
  },
};

export const copy: Record<Lang, Copy> = { en, fr };
