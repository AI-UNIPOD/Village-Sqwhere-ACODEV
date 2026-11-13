import type { Lang } from "../locales";

type Copy = {
  pageTitle: string;
  casePageTitle: string;
  title: string;
  lead: string;
  loading: string;
  done: { passed: string; failed: string };
  notVerifiedTitle: string;
  notVerifiedText: string;
  notVerifiedAction: string;
  emptyTitle: string;
  emptyText: string;
  attempt: string;
  waiting: string;
  repoOne: string;
  repoMany: string;
  review: string;
  loadMore: string;
  moreFailed: string;
  back: string;
  caseTitle: string;
  caseLoading: string;
  goneTitle: string;
  gone: string;
  goneAction: string;
  repositories: string;
  opensInNewTab: string;
  interview: string;
  question: string;
  theirAnswer: string;
  noAnswer: string;
  flags: { guard_not_configured: string; prompt_injection_suspected: string };
  repoCheck: string;
  criterionScore: string;
  aiTitle: string;
  aiLabel: string;
  aiMissing: string;
  codeShows: string;
  interviewShows: string;
  concerns: string;
  flagsTitle: string;
  suggestedScore: string;
  confidence: string;
  decisionTitle: string;
  notesLabel: string;
  notesHelp: string;
  notesEmpty: string;
  notesCount: string;
  pass: string;
  fail: string;
  passTitle: string;
  passText: string;
  failTitle: string;
  failText: string;
  passConfirm: string;
  failConfirm: string;
  goBack: string;
  saveFailed: string;
  errorTitle: string;
  errorText: string;
  retry: string;
};

const en: Copy = {
  pageTitle: "Peer reviews | Village Sqwhere",
  casePageTitle: "Review an attempt | Village Sqwhere",
  title: "Peer reviews",
  lead: "Developers verified in your role decide who earns a Green Tick. You review the work, not the person: the applicant's name is not shown.",
  loading: "Opening the reviews",
  done: { passed: "Decision recorded: passed.", failed: "Decision recorded: not passed." },
  notVerifiedTitle: "Only developers with a Green Tick can review.",
  notVerifiedText:
    "Finish your own verification first. Once a peer passes you, attempts in your role will wait for you here.",
  notVerifiedAction: "Earn my Green Tick",
  emptyTitle: "No attempts are waiting for you.",
  emptyText: "New ones appear here when developers in your role finish their interview.",
  attempt: "Attempt {n} of 3",
  waiting: "Waiting {time}",
  repoOne: "1 repository",
  repoMany: "{n} repositories",
  review: "Review",
  loadMore: "Load more",
  moreFailed: "We couldn't load more attempts. Check your connection and try again.",
  back: "All reviews",
  caseTitle: "Review: {role}, attempt {n}",
  caseLoading: "Opening the attempt",
  goneTitle: "Attempt closed",
  gone: "This case is no longer open. Another reviewer may have decided it.",
  goneAction: "Back to all reviews",
  repositories: "Repositories",
  opensInNewTab: "opens in a new tab",
  interview: "Interview",
  question: "Question {n}",
  theirAnswer: "Their answer",
  noAnswer: "No answer",
  flags: {
    guard_not_configured: "Not screened",
    prompt_injection_suspected: "Possible instruction to the AI",
  },
  repoCheck: "Repositories check",
  criterionScore: "{n} of 25",
  aiTitle: "The AI's report",
  aiLabel: "Written by the AI checker. A suggestion, not a decision.",
  aiMissing: "The AI report is missing for this attempt.",
  codeShows: "What the code shows",
  interviewShows: "What the interview shows",
  concerns: "Concerns",
  flagsTitle: "Flags",
  suggestedScore: "Suggested score: {score} of 100",
  confidence: "Confidence: {value}",
  decisionTitle: "Your decision",
  notesLabel: "Your notes for the applicant",
  notesHelp: "They will read this. Say what you saw and, if it is a no, what would change your mind.",
  notesEmpty: "Write a few lines for the applicant first.",
  notesCount: "{n} of 2000 characters",
  pass: "Pass",
  fail: "Do not pass",
  passTitle: "Pass this attempt?",
  passText: "The developer earns a Green Tick as {role}. This cannot be undone.",
  failTitle: "Turn this attempt down?",
  failText: "The developer can try again if they have attempts left. This cannot be undone.",
  passConfirm: "Pass the attempt",
  failConfirm: "Turn it down",
  goBack: "Go back",
  saveFailed: "Your decision was not saved. Your notes are still here, so you can try again.",
  errorTitle: "We couldn't open the reviews",
  errorText:
    "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
  retry: "Try again",
};

// Needs a native French review before launch.
const fr: Copy = {
  pageTitle: "Revues par les pairs | Village Sqwhere",
  casePageTitle: "Examiner une tentative | Village Sqwhere",
  title: "Revues par les pairs",
  lead: "Les développeurs vérifiés dans votre rôle décident qui obtient un Green Tick. Vous examinez le travail, pas la personne : le nom du candidat n'est pas affiché.",
  loading: "Ouverture des revues",
  done: { passed: "Décision enregistrée : validée.", failed: "Décision enregistrée : non validée." },
  notVerifiedTitle: "Seuls les développeurs avec un Green Tick peuvent examiner.",
  notVerifiedText:
    "Terminez d'abord votre propre vérification. Dès qu'un pair vous a validé, les tentatives de votre rôle vous attendront ici.",
  notVerifiedAction: "Obtenir mon Green Tick",
  emptyTitle: "Aucune tentative ne vous attend.",
  emptyText: "Les nouvelles apparaissent ici quand des développeurs de votre rôle terminent leur entretien.",
  attempt: "Tentative {n} sur 3",
  waiting: "En attente depuis {time}",
  repoOne: "1 dépôt",
  repoMany: "{n} dépôts",
  review: "Examiner",
  loadMore: "Afficher plus",
  moreFailed: "Nous n'avons pas pu charger d'autres tentatives. Vérifiez votre connexion et réessayez.",
  back: "Toutes les revues",
  caseTitle: "Revue : {role}, tentative {n}",
  caseLoading: "Ouverture de la tentative",
  goneTitle: "Tentative clôturée",
  gone: "Ce dossier n'est plus ouvert. Un autre relecteur l'a peut-être tranché.",
  goneAction: "Retour à toutes les revues",
  repositories: "Dépôts",
  opensInNewTab: "s'ouvre dans un nouvel onglet",
  interview: "Entretien",
  question: "Question {n}",
  theirAnswer: "Sa réponse",
  noAnswer: "Pas de réponse",
  flags: {
    guard_not_configured: "Non contrôlée",
    prompt_injection_suspected: "Instruction possible à l'IA",
  },
  repoCheck: "Analyse des dépôts",
  criterionScore: "{n} sur 25",
  aiTitle: "Le rapport de l'IA",
  aiLabel: "Rédigé par l'IA de vérification. Une suggestion, pas une décision.",
  aiMissing: "Le rapport de l'IA est absent pour cette tentative.",
  codeShows: "Ce que montre le code",
  interviewShows: "Ce que montre l'entretien",
  concerns: "Points d'attention",
  flagsTitle: "Signaux",
  suggestedScore: "Score suggéré : {score} sur 100",
  confidence: "Confiance : {value}",
  decisionTitle: "Votre décision",
  notesLabel: "Vos notes pour le candidat",
  notesHelp:
    "Il les lira. Dites ce que vous avez vu et, si c'est non, ce qui pourrait vous faire changer d'avis.",
  notesEmpty: "Écrivez d'abord quelques lignes pour le candidat.",
  notesCount: "{n} caractères sur 2000",
  pass: "Valider",
  fail: "Ne pas valider",
  passTitle: "Valider cette tentative ?",
  passText: "Le développeur obtient un Green Tick pour le rôle {role}. Cette action est irréversible.",
  failTitle: "Refuser cette tentative ?",
  failText:
    "Le développeur pourra réessayer s'il lui reste des tentatives. Cette action est irréversible.",
  passConfirm: "Valider la tentative",
  failConfirm: "Refuser la tentative",
  goBack: "Retour",
  saveFailed: "Votre décision n'a pas été enregistrée. Vos notes sont toujours là, vous pouvez donc réessayer.",
  errorTitle: "Nous n'avons pas pu ouvrir les revues",
  errorText:
    "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela se reproduit, revenez dans quelques minutes.",
  retry: "Réessayer",
};

export const copy: Record<Lang, Copy> = { en, fr };
