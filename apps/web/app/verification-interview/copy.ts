import type { Lang } from "../locales";

type Say = { title: string; text: string };

type Copy = {
  pageTitle: string;
  title: string;
  loading: string;
  lead: string;
  expect: string[];
  warning: Say;
  begin: string;
  notNow: string;
  back: string;
  missing: Say;
  unavailable: { checking: Say; answered: Say; review: Say; ended: Say };
  transcript: string;
  interviewer: string;
  you: string;
  question: string;
  connecting: string;
  reading: string;
  answerLabel: string;
  helper: string;
  send: string;
  count: string;
  problems: { required: string; tooLong: string; failed: string };
  leave: string;
  leaveTitle: string;
  leaveText: string;
  leaveConfirm: string;
  stay: string;
  finished: Say;
  left: Say;
  dropped: Say;
  refused: Say;
  errorTitle: string;
  errorText: string;
  retry: string;
};

const en: Copy = {
  pageTitle: "Verification interview | Village Sqwhere",
  title: "Interview for your Green Tick",
  loading: "Opening your interview",
  lead: "This is stage two of three: after the check of your repositories, before a verified peer decides.",
  expect: [
    "Five questions about the repositories you shared and about your role.",
    "You type each answer, up to 10,000 characters.",
    "There is no timer, so take the time each answer needs.",
    "The interviewer is an AI. It decides nothing: a verified peer makes the decision.",
  ],
  warning: {
    title: "Stay on this page until the end",
    text: "If you close the tab, leave the page or lose your connection, this attempt ends and counts as one of your three. Use a connection you trust.",
  },
  begin: "Begin the interview",
  notNow: "Not now",
  back: "Back to your verification",
  missing: {
    title: "We couldn't find this interview",
    text: "Check the link, or open your verification page to find your attempts.",
  },
  unavailable: {
    checking: {
      title: "Your repositories are still being checked",
      text: "The interview opens when that check is done. Come back to your verification page in a few minutes.",
    },
    answered: {
      title: "You have already answered",
      text: "Your answers are saved. The report for your reviewer is being written.",
    },
    review: {
      title: "A verified peer is reviewing this attempt",
      text: "Your answers are with them. You will see the decision on your verification page.",
    },
    ended: {
      title: "This attempt has ended",
      text: "An ended attempt cannot be opened again. If you have attempts left, you can start a new one from your verification page.",
    },
  },
  transcript: "Interview transcript",
  interviewer: "Interviewer",
  you: "You",
  question: "Question {n}",
  connecting: "Connecting to the interviewer",
  reading: "The interviewer is reading your answer",
  answerLabel: "Your answer",
  helper: "Ctrl and Enter sends",
  send: "Send answer",
  count: "{count} of 10,000 characters",
  problems: {
    required: "Write your answer before sending it.",
    tooLong: "Your answer is over 10,000 characters. Shorten it, then send it again.",
    failed: "That did not go through. Send your answer again.",
  },
  leave: "Leave the interview",
  leaveTitle: "Leave the interview?",
  leaveText: "This attempt ends now and counts as one of your three.",
  leaveConfirm: "Leave and end the attempt",
  stay: "Stay",
  finished: {
    title: "Your answers are saved",
    text: "The report for your reviewer is being written, then a verified peer decides.",
  },
  left: {
    title: "You left the interview",
    text: "This attempt has ended.",
  },
  dropped: {
    title: "The connection dropped",
    text: "This attempt has ended. Your earlier answers were kept with it. If you have attempts left, you can start a new one.",
  },
  refused: {
    title: "We couldn't start the interview",
    text: "It may already have been taken or ended.",
  },
  errorTitle: "We couldn't open your interview",
  errorText:
    "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Entretien de vérification | Village Sqwhere",
  title: "Entretien pour votre Green Tick",
  loading: "Ouverture de votre entretien",
  lead: "C'est la deuxième des trois étapes\u202f: après l'analyse de vos dépôts, avant la décision d'un pair vérifié.",
  expect: [
    "Cinq questions sur les dépôts que vous avez partagés et sur votre rôle.",
    "Vous saisissez chaque réponse, jusqu'à 10\u202f000 caractères.",
    "Il n'y a pas de minuteur\u202f: prenez le temps qu'il faut pour chaque réponse.",
    "L'intervieweur est une IA. Elle ne décide de rien\u202f: c'est un pair vérifié qui décide.",
  ],
  warning: {
    title: "Restez sur cette page jusqu'à la fin",
    text: "Si vous fermez l'onglet, quittez la page ou perdez votre connexion, cette tentative prend fin et compte parmi vos trois. Utilisez une connexion fiable.",
  },
  begin: "Commencer l'entretien",
  notNow: "Pas maintenant",
  back: "Retour à votre vérification",
  missing: {
    title: "Nous n'avons pas trouvé cet entretien",
    text: "Vérifiez le lien, ou ouvrez votre page de vérification pour retrouver vos tentatives.",
  },
  unavailable: {
    checking: {
      title: "Vos dépôts sont encore en cours d'analyse",
      text: "L'entretien s'ouvre à la fin de cette analyse. Revenez sur votre page de vérification dans quelques minutes.",
    },
    answered: {
      title: "Vous avez déjà répondu",
      text: "Vos réponses sont enregistrées. Le rapport destiné à votre évaluateur est en cours de rédaction.",
    },
    review: {
      title: "Un pair vérifié examine cette tentative",
      text: "Vos réponses sont entre ses mains. Vous verrez la décision sur votre page de vérification.",
    },
    ended: {
      title: "Cette tentative est terminée",
      text: "Une tentative terminée ne peut plus être ouverte. S'il vous reste des tentatives, vous pouvez en commencer une nouvelle depuis votre page de vérification.",
    },
  },
  transcript: "Transcription de l'entretien",
  interviewer: "Intervieweur",
  you: "Vous",
  question: "Question {n}",
  connecting: "Connexion à l'intervieweur",
  reading: "L'intervieweur lit votre réponse",
  answerLabel: "Votre réponse",
  helper: "Ctrl et Entrée envoie",
  send: "Envoyer la réponse",
  count: "{count} sur 10\u202f000 caractères",
  problems: {
    required: "Écrivez votre réponse avant de l'envoyer.",
    tooLong: "Votre réponse dépasse 10\u202f000 caractères. Raccourcissez-la, puis envoyez-la de nouveau.",
    failed: "Cela n'a pas abouti. Envoyez de nouveau votre réponse.",
  },
  leave: "Quitter l'entretien",
  leaveTitle: "Quitter l'entretien\u202f?",
  leaveText: "Cette tentative prend fin maintenant et compte parmi vos trois.",
  leaveConfirm: "Quitter et terminer la tentative",
  stay: "Rester",
  finished: {
    title: "Vos réponses sont enregistrées",
    text: "Le rapport destiné à votre évaluateur est en cours de rédaction, puis un pair vérifié décide.",
  },
  left: {
    title: "Vous avez quitté l'entretien",
    text: "Cette tentative est terminée.",
  },
  dropped: {
    title: "La connexion a été coupée",
    text: "Cette tentative est terminée. Vos réponses précédentes ont été conservées avec elle. S'il vous reste des tentatives, vous pouvez en commencer une nouvelle.",
  },
  refused: {
    title: "Nous n'avons pas pu démarrer l'entretien",
    text: "Il a peut-être déjà été passé ou terminé.",
  },
  errorTitle: "Nous n'avons pas pu ouvrir votre entretien",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela se reproduit, revenez dans quelques minutes.",
  retry: "Réessayer",
};

export const copy: Record<Lang, Copy> = { en, fr };
