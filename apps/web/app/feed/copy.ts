import type { Lang } from "../locales";

// every type a post can have, except the plain one, which has no label
export type LabelledType =
  | "question"
  | "architecture_challenge"
  | "code_review_request"
  | "oss_release"
  | "rfc"
  | "research_note"
  | "hub_milestone";

type Empty = { title: string; text: string; action: string };

type Copy = {
  title: string;
  lead: string;
  tabs: string;
  tabForYou: string;
  tabSaved: string;
  tabMine: string;
  pageTitle: { forYou: string; saved: string; mine: string };
  empty: { forYou: Empty; saved: Empty; mine: Empty };
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
  loadMore: string;
  moreFailed: string;
  deleted: string;
  types: Record<LabelledType, string>;
  ago: string;
  postBy: string;
  opensNewTab: string;
  like: string;
  likeCount: string;
  save: string;
  likeFailed: string;
  saveFailed: string;
  commentOne: string;
  commentMany: string;
  post: {
    pageTitle: string;
    back: string;
    edited: string;
    commentsSoon: string;
    delete: string;
    deleteConfirm: { title: string; text: string; confirm: string; cancel: string };
    deleteFailed: string;
    notAuthor: string;
    goneTitle: string;
    goneText: string;
    goneAction: string;
    loading: string;
    errorTitle: string;
  };
};

export const copy: Record<Lang, Copy> = {
  en: {
    title: "Feed",
    lead: "Knowledge, questions and releases from developers across Africa.",
    tabs: "Feed pages",
    tabForYou: "For you",
    tabSaved: "Saved",
    tabMine: "Yours",
    pageTitle: {
      forYou: "Feed | Village Sqwhere",
      saved: "Saved posts | Village Sqwhere",
      mine: "Your posts | Village Sqwhere",
    },
    empty: {
      forYou: {
        title: "Nobody has posted yet",
        text: "When developers share what they know, ask a question or announce a release, it shows up here.",
        action: "See open ideas",
      },
      saved: {
        title: "Nothing saved yet",
        text: "Press Save on a post to keep it here, so you can find it again when you need it.",
        action: "Go to For you",
      },
      mine: {
        title: "You have not posted yet",
        text: "What you share will show up here. Until then, see what other developers are posting.",
        action: "Go to For you",
      },
    },
    loading: "Getting the feed",
    errorTitle: "We couldn't show the feed",
    errorText:
      "Something went wrong on our side. Nothing was changed, so you can safely try again. If it keeps happening, come back in a few minutes.",
    retry: "Try again",
    loadMore: "Show more",
    moreFailed: "We couldn't load more posts. The ones above are still here, so try again.",
    deleted: "Post deleted",
    types: {
      question: "Question",
      architecture_challenge: "Architecture challenge",
      code_review_request: "Code review request",
      oss_release: "Open source release",
      rfc: "RFC",
      research_note: "Research note",
      hub_milestone: "Hub milestone",
    },
    ago: "{time} ago",
    postBy: "Post by {name}",
    opensNewTab: "opens in a new tab",
    like: "Like",
    likeCount: "Like ({n})",
    save: "Save",
    likeFailed: "The like did not go through. Try again.",
    saveFailed: "The save did not go through. Try again.",
    commentOne: "{n} comment",
    commentMany: "{n} comments",
    post: {
      pageTitle: "A post | Village Sqwhere",
      back: "Feed",
      edited: "Edited {time}",
      commentsSoon: "Comments are coming soon. Until then, you can only see how many there are.",
      delete: "Delete post",
      deleteConfirm: {
        title: "Delete this post?",
        text: "It will be removed for everyone, and you cannot bring it back.",
        confirm: "Delete post",
        cancel: "Keep post",
      },
      deleteFailed: "We couldn't delete the post. Nothing was changed, so try again.",
      notAuthor: "Only the author can delete this post.",
      goneTitle: "This post is gone",
      goneText: "Its author may have deleted it, or the address is wrong.",
      goneAction: "Back to the feed",
      loading: "Getting the post",
      errorTitle: "We couldn't show this post",
    },
  },
  // Needs a native French review before launch.
  fr: {
    title: "Fil",
    lead: "Savoirs, questions et nouvelles versions de développeurs de toute l'Afrique.",
    tabs: "Pages du fil",
    tabForYou: "Pour vous",
    tabSaved: "Enregistrés",
    tabMine: "Les vôtres",
    pageTitle: {
      forYou: "Fil | Village Sqwhere",
      saved: "Publications enregistrées | Village Sqwhere",
      mine: "Vos publications | Village Sqwhere",
    },
    empty: {
      forYou: {
        title: "Personne n'a encore publié",
        text: "Quand des développeurs partagent ce qu'ils savent, posent une question ou annoncent une version, cela s'affiche ici.",
        action: "Voir les idées ouvertes",
      },
      saved: {
        title: "Rien d'enregistré pour l'instant",
        text: "Appuyez sur Enregistrer sous une publication pour la garder ici et la retrouver au besoin.",
        action: "Aller à Pour vous",
      },
      mine: {
        title: "Vous n'avez pas encore publié",
        text: "Ce que vous partagez s'affichera ici. D'ici là, voyez ce que publient les autres développeurs.",
        action: "Aller à Pour vous",
      },
    },
    loading: "Chargement du fil",
    errorTitle: "Nous n'avons pas pu afficher le fil",
    errorText:
      "Un problème est survenu de notre côté. Rien n'a été modifié, vous pouvez donc réessayer sans risque. Si cela se reproduit, revenez dans quelques minutes.",
    retry: "Réessayer",
    loadMore: "Afficher plus",
    moreFailed: "Nous n'avons pas pu charger d'autres publications. Celles ci-dessus sont toujours là, réessayez.",
    deleted: "Publication supprimée",
    types: {
      question: "Question",
      architecture_challenge: "Défi d'architecture",
      code_review_request: "Demande de revue de code",
      oss_release: "Version open source",
      rfc: "RFC",
      research_note: "Note de recherche",
      hub_milestone: "Étape d'espace",
    },
    ago: "il y a {time}",
    postBy: "Publication de {name}",
    opensNewTab: "s'ouvre dans un nouvel onglet",
    like: "J'aime",
    likeCount: "J'aime ({n})",
    save: "Enregistrer",
    likeFailed: "Le j'aime n'a pas abouti. Réessayez.",
    saveFailed: "L'enregistrement n'a pas abouti. Réessayez.",
    commentOne: "{n} commentaire",
    commentMany: "{n} commentaires",
    post: {
      pageTitle: "Une publication | Village Sqwhere",
      back: "Fil",
      edited: "Modifiée {time}",
      commentsSoon: "Les commentaires arrivent bientôt. D'ici là, vous pouvez seulement voir leur nombre.",
      delete: "Supprimer la publication",
      deleteConfirm: {
        title: "Supprimer cette publication\u202f?",
        text: "Elle sera retirée pour tout le monde, et vous ne pourrez pas la récupérer.",
        confirm: "Supprimer la publication",
        cancel: "Garder la publication",
      },
      deleteFailed: "Nous n'avons pas pu supprimer la publication. Rien n'a été modifié, réessayez.",
      notAuthor: "Seul l'auteur peut supprimer cette publication.",
      goneTitle: "Cette publication n'existe plus",
      goneText: "Son auteur l'a peut-être supprimée, ou l'adresse est erronée.",
      goneAction: "Retour au fil",
      loading: "Chargement de la publication",
      errorTitle: "Nous n'avons pas pu afficher cette publication",
    },
  },
};
