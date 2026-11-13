import type { Lang } from "../locales";

type Stage = { title: string; text: string };

export type Copy = {
  pageTitle: string;
  title: string;
  lead: string;
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
  noRole: { title: string; text: string; action: string };
  verified: { title: string; since: string; meaning: string };
  village: string;
  trackerTitle: string;
  stages: {
    repositories: { title: string; now: string; retrying: string; done: string };
    interview: { title: string; later: string; warning: string; start: string; done: string; ready: string };
    review: { title: string; later: string; now: string };
  };
  pills: { done: string; checking: string; yourTurn: string; waiting: string; writing: string; later: string };
  reassure: string;
  submitted: string;
  newTab: string;
  stop: { button: string; title: string; text: string; confirm: string; keep: string; failed: string };
  lastAttempt: { failed: string; abandoned: string; notes: string; left: { one: string; many: string }; exhausted: string };
  what: { title: string; stages: [Stage, Stage, Stage] };
  form: {
    attempt: string;
    label: string;
    help: string;
    consent: string;
    submit: string;
    errors: { empty: string; tooMany: string; notGithub: string; duplicate: string; consent: string; rejected: string };
    failed: { network: string; server: string };
  };
  earlier: { title: string; attempt: string; started: string; notes: string; passed: string; failed: string; abandoned: string };
};

const en: Copy = {
  pageTitle: "Earn your Green Tick | Village Sqwhere",
  title: "Earn your Green Tick",
  lead: "Your main role is {role}. Three steps, and a developer already verified in that role makes the final call.",
  loading: "Opening your verification",
  errorTitle: "We couldn't open your verification",
  errorText:
    "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
  noRole: {
    title: "Choose your main role first",
    text: "A Green Tick is for your main role, so we need to know it before we can check it.",
    action: "Choose my role",
  },
  verified: {
    title: "Your role is verified",
    since: "Verified since {date}.",
    meaning:
      "Idea owners can now be shown your profile, and you can review other developers' attempts in this role.",
  },
  village: "Back to the village",
  trackerTitle: "Where things stand",
  stages: {
    repositories: {
      title: "Repositories check",
      now: "Our AI checker is reading your public repositories. This usually takes a few minutes.",
      retrying: "The first check did not finish. We are trying again.",
      done: "Your repositories have been read.",
    },
    interview: {
      title: "Interview",
      later: "Five questions from an AI interviewer. You type your answers.",
      warning: "Five questions, typed answers. Once you start, stay on the page: leaving ends the attempt.",
      start: "Start the interview",
      done: "Your answers are in. The report for your reviewer is being written.",
      ready: "Your answers are in and the report is ready.",
    },
    review: {
      title: "Peer review",
      later: "When the report is ready, a developer verified in this role reads it and decides.",
      now: "A developer verified in this role will read the report and decide. This can take a few days.",
    },
  },
  pills: {
    done: "Done",
    checking: "Checking",
    yourTurn: "Your turn",
    waiting: "Waiting",
    writing: "Writing the report",
    later: "Later",
  },
  reassure: "You can leave this page. We keep working and this page shows where things stand when you come back.",
  submitted: "Repositories submitted",
  newTab: "opens in a new tab",
  stop: {
    button: "Stop this attempt",
    title: "Stop this attempt?",
    text: "It ends now and counts as one of your three.",
    confirm: "Stop the attempt",
    keep: "Keep going",
    failed: "We could not stop the attempt. Nothing was changed, so you can try again.",
  },
  lastAttempt: {
    failed: "Your last attempt was not passed.",
    abandoned: "Your last attempt ended before it was finished.",
    notes: "Reviewer's notes",
    left: { one: "You have 1 attempt left for this role.", many: "You have {n} attempts left for this role." },
    exhausted: "You have used all three attempts for this role.",
  },
  what: {
    title: "What happens",
    stages: [
      { title: "Repositories check", text: "Our AI checker reads the public code you share." },
      { title: "Interview", text: "Five questions from an AI interviewer. You type your answers." },
      { title: "Peer review", text: "A developer verified in your role reads the report and decides." },
    ],
  },
  form: {
    attempt: "Attempt {n} of 3",
    label: "Repositories",
    help: "One GitHub address per line, up to 10. Public repositories only, for example https://github.com/your-name/your-project",
    consent:
      "I agree that the public code in these repositories is read by an AI checker, and that my interview answers are kept with this attempt. Private repositories are never read.",
    submit: "Start verification",
    errors: {
      empty: "Add at least one repository address.",
      tooMany: "Add 10 repositories at most. You added {n}.",
      notGithub: "Line {n} is not a GitHub repository address. Write it like https://github.com/your-name/your-project.",
      duplicate: "Line {n} repeats an address from a line above. List each repository once.",
      consent: "Tick the box to agree before you start.",
      rejected: "Check the repository addresses and try again.",
    },
    failed: {
      network:
        "We could not reach Village Sqwhere, so the verification did not start. Your addresses are still here. Check your connection and try again.",
      server:
        "Something went wrong on our side, so the verification did not start. Your addresses are still here, so you can try again.",
    },
  },
  earlier: {
    title: "Earlier attempts",
    attempt: "Attempt {n}",
    started: "Started {date}",
    notes: "Reviewer's notes",
    passed: "Passed",
    failed: "Not passed",
    abandoned: "Stopped",
  },
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Obtenez votre Green Tick | Village Sqwhere",
  title: "Obtenez votre Green Tick",
  lead: "Votre rôle principal est {role}. Trois étapes, puis un développeur déjà vérifié dans ce rôle prend la décision finale.",
  loading: "Ouverture de votre vérification",
  errorTitle: "Nous n'avons pas pu ouvrir votre vérification",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela se reproduit, revenez dans quelques minutes.",
  retry: "Réessayer",
  noRole: {
    title: "Choisissez d'abord votre rôle principal",
    text: "Un Green Tick porte sur votre rôle principal : nous devons le connaître avant de pouvoir le vérifier.",
    action: "Choisir mon rôle",
  },
  verified: {
    title: "Votre rôle est vérifié",
    since: "Vérifié depuis le {date}.",
    meaning:
      "Les porteurs d'idées peuvent désormais voir votre profil, et vous pouvez relire les tentatives d'autres développeurs dans ce rôle.",
  },
  village: "Retour au village",
  trackerTitle: "Où en sont les choses",
  stages: {
    repositories: {
      title: "Analyse des dépôts",
      now: "Notre vérificateur IA lit vos dépôts publics. Cela prend en général quelques minutes.",
      retrying: "La première analyse n'a pas abouti. Nous réessayons.",
      done: "Vos dépôts ont été lus.",
    },
    interview: {
      title: "Entretien",
      later: "Cinq questions posées par un intervieweur IA. Vous répondez par écrit.",
      warning:
        "Cinq questions, réponses écrites. Une fois commencé, restez sur la page : la quitter met fin à la tentative.",
      start: "Commencer l'entretien",
      done: "Vos réponses sont enregistrées. Le rapport pour votre relecteur est en cours de rédaction.",
      ready: "Vos réponses sont enregistrées et le rapport est prêt.",
    },
    review: {
      title: "Relecture par un pair",
      later: "Quand le rapport est prêt, un développeur vérifié dans ce rôle le lit et décide.",
      now: "Un développeur vérifié dans ce rôle lira le rapport et décidera. Cela peut prendre quelques jours.",
    },
  },
  pills: {
    done: "Fait",
    checking: "Analyse en cours",
    yourTurn: "À vous",
    waiting: "En attente",
    writing: "Rédaction du rapport",
    later: "Plus tard",
  },
  reassure:
    "Vous pouvez quitter cette page. Nous continuons le travail, et cette page montre où en sont les choses à votre retour.",
  submitted: "Dépôts envoyés",
  newTab: "s'ouvre dans un nouvel onglet",
  stop: {
    button: "Arrêter cette tentative",
    title: "Arrêter cette tentative ?",
    text: "Elle prend fin maintenant et compte pour l'une de vos trois.",
    confirm: "Arrêter la tentative",
    keep: "Continuer",
    failed: "Nous n'avons pas pu arrêter la tentative. Rien n'a été modifié, vous pouvez donc réessayer.",
  },
  lastAttempt: {
    failed: "Votre dernière tentative n'a pas été validée.",
    abandoned: "Votre dernière tentative s'est arrêtée avant la fin.",
    notes: "Notes du relecteur",
    left: { one: "Il vous reste 1 tentative pour ce rôle.", many: "Il vous reste {n} tentatives pour ce rôle." },
    exhausted: "Vous avez utilisé vos trois tentatives pour ce rôle.",
  },
  what: {
    title: "Ce qui se passe",
    stages: [
      { title: "Analyse des dépôts", text: "Notre vérificateur IA lit le code public que vous partagez." },
      { title: "Entretien", text: "Cinq questions posées par un intervieweur IA. Vous répondez par écrit." },
      { title: "Relecture par un pair", text: "Un développeur vérifié dans votre rôle lit le rapport et décide." },
    ],
  },
  form: {
    attempt: "Tentative {n} sur 3",
    label: "Dépôts",
    help: "Une adresse GitHub par ligne, 10 au maximum. Dépôts publics uniquement, par exemple https://github.com/votre-nom/votre-projet",
    consent:
      "J'accepte que le code public de ces dépôts soit lu par un vérificateur IA, et que mes réponses à l'entretien soient conservées avec cette tentative. Les dépôts privés ne sont jamais lus.",
    submit: "Lancer la vérification",
    errors: {
      empty: "Ajoutez au moins une adresse de dépôt.",
      tooMany: "Ajoutez 10 dépôts au maximum. Vous en avez ajouté {n}.",
      notGithub:
        "La ligne {n} n'est pas une adresse de dépôt GitHub. Écrivez-la comme https://github.com/votre-nom/votre-projet.",
      duplicate: "La ligne {n} répète une adresse d'une ligne plus haut. Indiquez chaque dépôt une seule fois.",
      consent: "Cochez la case pour accepter avant de commencer.",
      rejected: "Vérifiez les adresses des dépôts et réessayez.",
    },
    failed: {
      network:
        "Nous n'avons pas pu joindre Village Sqwhere, la vérification n'a donc pas démarré. Vos adresses sont toujours là. Vérifiez votre connexion et réessayez.",
      server:
        "Un problème est survenu de notre côté, la vérification n'a donc pas démarré. Vos adresses sont toujours là, vous pouvez donc réessayer.",
    },
  },
  earlier: {
    title: "Tentatives précédentes",
    attempt: "Tentative {n}",
    started: "Commencée le {date}",
    notes: "Notes du relecteur",
    passed: "Validée",
    failed: "Non validée",
    abandoned: "Arrêtée",
  },
};

export const copy: Record<Lang, Copy> = { en, fr };
