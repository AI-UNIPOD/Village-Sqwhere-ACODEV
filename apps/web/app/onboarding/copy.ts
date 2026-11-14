import type { Lang } from "../locales";

type Question = { title: string; why: string };
type Empty = { title: string; stack: string; country: string; clear: string };

type Copy = {
  pageTitle: string;
  pause: string;
  play: string;
  welcomeTitle: string;
  welcomeSub: string;
  signedIn: string;
  start: string;
  skipForNow: string;
  back: string;
  stepOf: string;
  stepAnnounce: string;
  next: string;
  skip: string;
  role: Question & { error: string };
  stack: Question & { error: string; filter: string; selected: string };
  country: Question & { note: string; filter: string; selected: string };
  topics: Question;
  feed: Question & { useStack: string };
  empty: Empty;
  doneTitle: string;
  noRole: string;
  finishLater: string;
  stackLabel: string;
  topicsLabel: string;
  feedLabel: string;
  nextTitle: string;
  nextSteps: string[];
  saving: string;
  saved: string;
  savedWithCountry: string;
  saveFailed: string;
  village: string;
  change: string;
  githubProfile: string;
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
};

const en: Copy = {
  pageTitle: "Set up your profile | Village Sqwhere",
  pause: "Pause animation",
  play: "Play animation",
  welcomeTitle: "Welcome to the village, {name}.",
  welcomeSub:
    "Five quick questions so we can match you with people building ideas like yours. About a minute.",
  signedIn: "Signed in with GitHub as @{username}",
  start: "Set up my profile",
  skipForNow: "Skip for now",
  back: "Back",
  stepOf: "Step {n} of {total}",
  stepAnnounce: "Step {n} of {total}: {title}",
  next: "Continue",
  skip: "Skip",
  role: {
    title: "What do you do most?",
    why: "Your main role decides which teams we suggest for you. You can add more roles later.",
    error: "Pick the role you do most to continue.",
  },
  stack: {
    title: "What do you build with?",
    why: "We match people whose skills fit together.",
    error: "Pick at least one technology to continue.",
    filter: "Filter technologies",
    selected: "{n} selected",
  },
  country: {
    title: "Where do you build from?",
    why: "Teammates in nearby time zones find it easier to meet.",
    note: "Optional. Other signed-in developers can see your country.",
    filter: "Filter countries",
    selected: "Selected: {country}",
  },
  topics: {
    title: "Which ideas do you want to see?",
    why: "Your feed shows ideas from these areas first.",
  },
  feed: {
    title: "What do you want to read about?",
    why: "Your feed shows posts about these technologies. Choose none to see every post. You can change this on the feed.",
    useStack: "Use my stack",
  },
  empty: {
    title: "No match",
    stack: 'No technology matches "{query}". Check the spelling or clear the filter.',
    country: 'No country matches "{query}". Check the spelling or clear the filter.',
    clear: "Clear filter",
  },
  doneTitle: "You're in, {name}.",
  noRole: "Role not chosen yet",
  finishLater: "Finish your profile any time",
  stackLabel: "Stack",
  topicsLabel: "Sectors",
  feedLabel: "In your feed",
  nextTitle: "What happens next",
  nextSteps: [
    "Share an idea, or wait for one that fits your skills.",
    "We suggest teammates when your skills match an idea.",
    "Verify your role to earn your Green Tick.",
  ],
  saving: "Saving your answers",
  saved: "Your role, stack, sectors and what your feed shows are saved.",
  savedWithCountry: "Your role, stack, sectors, country and what your feed shows are saved.",
  saveFailed: "We couldn't save your answers. They are still here, so try again.",
  village: "Go to the village",
  change: "Change my answers",
  githubProfile: "GitHub profile, opens in a new tab",
  loading: "Getting your profile ready",
  errorTitle: "We couldn't show this page",
  errorText:
    "Something went wrong on our side. Nothing was saved, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Configurer votre profil | Village Sqwhere",
  pause: "Mettre l'animation en pause",
  play: "Lire l'animation",
  welcomeTitle: "Bienvenue au village, {name}.",
  welcomeSub:
    "Cinq questions rapides pour vous mettre en relation avec des développeurs qui construisent des idées comme la vôtre. Environ une minute.",
  signedIn: "Session GitHub ouverte pour @{username}",
  start: "Configurer mon profil",
  skipForNow: "Passer pour l'instant",
  back: "Retour",
  stepOf: "Étape {n} sur {total}",
  stepAnnounce: "Étape {n} sur {total}\u202f: {title}",
  next: "Continuer",
  skip: "Passer",
  role: {
    title: "Quel est votre rôle principal\u202f?",
    why: "Votre rôle principal détermine les équipes que nous vous proposons. Vous pourrez ajouter d'autres rôles plus tard.",
    error: "Choisissez le rôle que vous exercez le plus pour continuer.",
  },
  stack: {
    title: "Avec quoi construisez-vous\u202f?",
    why: "Nous réunissons des développeurs aux compétences complémentaires.",
    error: "Choisissez au moins une technologie pour continuer.",
    filter: "Filtrer les technologies",
    selected: "Sélection\u202f: {n}",
  },
  country: {
    title: "Depuis où construisez-vous\u202f?",
    why: "Des coéquipiers dans des fuseaux horaires proches se retrouvent plus facilement.",
    note: "Facultatif. Les autres développeurs connectés peuvent voir votre pays.",
    filter: "Filtrer les pays",
    selected: "Sélection\u202f: {country}",
  },
  topics: {
    title: "Quelles idées voulez-vous voir\u202f?",
    why: "Votre fil affiche d'abord les idées de ces domaines.",
  },
  feed: {
    title: "Sur quoi voulez-vous lire\u202f?",
    why: "Votre fil affiche les publications sur ces technologies. N'en choisissez aucune pour tout voir. Vous pourrez changer cela dans le fil.",
    useStack: "Reprendre mes technologies",
  },
  empty: {
    title: "Aucun résultat",
    stack:
      "Aucune technologie ne correspond à «\u202f{query}\u202f». Vérifiez l'orthographe ou effacez le filtre.",
    country:
      "Aucun pays ne correspond à «\u202f{query}\u202f». Vérifiez l'orthographe ou effacez le filtre.",
    clear: "Effacer le filtre",
  },
  doneTitle: "Vous voilà dans le village, {name}.",
  noRole: "Rôle pas encore choisi",
  finishLater: "Vous pourrez compléter votre profil quand vous voulez",
  stackLabel: "Technologies",
  topicsLabel: "Domaines",
  feedLabel: "Dans votre fil",
  nextTitle: "Et ensuite",
  nextSteps: [
    "Partagez une idée, ou attendez qu'une idée corresponde à vos compétences.",
    "Nous vous proposons des coéquipiers quand vos compétences correspondent à une idée.",
    "Faites vérifier votre rôle pour obtenir votre Green Tick.",
  ],
  saving: "Enregistrement de vos réponses",
  saved: "Votre rôle, vos technologies, vos domaines et le contenu de votre fil sont enregistrés.",
  savedWithCountry:
    "Votre rôle, vos technologies, vos domaines, votre pays et le contenu de votre fil sont enregistrés.",
  saveFailed:
    "Nous n'avons pas pu enregistrer vos réponses. Elles sont toujours là, vous pouvez donc réessayer.",
  village: "Aller au village",
  change: "Modifier mes réponses",
  githubProfile: "profil GitHub, s'ouvre dans un nouvel onglet",
  loading: "Préparation de votre profil",
  errorTitle: "Nous n'avons pas pu afficher cette page",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été enregistré, vous pouvez donc réessayer sans risque. Si cela continue, revenez dans quelques minutes.",
  retry: "Réessayer",
};

export const copy: Record<Lang, Copy> = { en, fr };

// Fills {name} style slots in a copy string.
export function fill(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}
