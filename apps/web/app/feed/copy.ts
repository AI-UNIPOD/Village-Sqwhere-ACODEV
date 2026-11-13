import type { Lang } from "../locales";
import type { Kind } from "./feed-api";

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
  write: string;
  done: { published: string; saved: string };
  topics: {
    everyone: string;
    choose: string;
    change: string;
    about: string;
    and: string;
    more: string;
    own: string;
    label: string;
    help: string;
    save: string;
    cancel: string;
    failed: string;
  };
  compose: {
    pageTitle: string;
    newTitle: string;
    editTitle: string;
    kindLabel: string;
    general: string;
    hints: Record<Kind, string>;
    fixedKind: string;
    fixedTopics: string;
    noTopics: string;
    title: { label: string; optional: string; required: string; help: string; rfcHelp: string };
    body: { label: string; help: string };
    link: { label: string; optional: string; help: string };
    topics: { label: string; optional: string; help: string; full: string };
    count: string;
    publish: string;
    saveChanges: string;
    cancel: string;
    errors: {
      bodyEmpty: string;
      bodyLong: string;
      titleLong: string;
      titleRfc: string;
      linkBad: string;
      linkLong: string;
      refused: string;
      unknownTopic: string;
      tooManyTopics: string;
      duplicateTopics: string;
      hubMilestone: string;
      nothingChanged: string;
      publish: string;
      save: string;
    };
    notYours: { title: string; text: string; action: string };
  };
  post: {
    pageTitle: string;
    back: string;
    edited: string;
    commentsSoon: string;
    edit: string;
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
        text: "What you share will show up here. Write about something you learned, or ask the question you are stuck on.",
        action: "Write your first post",
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
    write: "Write a post",
    done: { published: "Post published", saved: "Changes saved" },
    topics: {
      everyone: "Showing every post",
      choose: "Choose topics",
      change: "Change topics",
      about: "Showing posts about {topics}",
      and: "{list} and {last}",
      more: "{list} and {n} more",
      own: "Your own posts always show too.",
      label: "Topics for your feed",
      help: "Choose the topics you want to see. Save with none chosen to see every post.",
      save: "Save",
      cancel: "Cancel",
      failed: "We couldn't save your topics. Nothing was changed, so try again.",
    },
    compose: {
      pageTitle: "Write a post | Village Sqwhere",
      newTitle: "Write a post",
      editTitle: "Edit your post",
      kindLabel: "Kind of post",
      general: "General",
      hints: {
        general: "Anything you want to share.",
        question: "Something you are stuck on or want opinions on.",
        architecture_challenge: "A design decision you want to talk through.",
        code_review_request: "Code you would like another developer to read.",
        oss_release: "A new version or project you are releasing.",
        rfc: "A proposal for comments. It needs a title.",
        research_note: "What you found out while studying something.",
      },
      fixedKind: "The kind cannot be changed after you post.",
      fixedTopics: "The topics cannot be changed after you post.",
      noTopics: "None",
      title: {
        label: "Title",
        optional: "optional",
        required: "required for an RFC",
        help: "A short headline. Without one, the first line of your text leads.",
        rfcHelp: "An RFC is a proposal for comments, so it needs a title.",
      },
      body: { label: "Text", help: "Plain text. Line breaks are kept, and nothing is formatted." },
      link: { label: "Link", optional: "optional", help: "A web address that starts with http:// or https://." },
      topics: {
        label: "Topics",
        optional: "optional",
        help: "Up to 5 technologies your post is about.",
        full: "You chose 5 topics, the most a post can have. Remove one to choose another.",
      },
      count: "{n} of {max}",
      publish: "Publish",
      saveChanges: "Save changes",
      cancel: "Cancel",
      errors: {
        bodyEmpty: "Write something in the text. A post cannot be empty.",
        bodyLong: "Shorten the text to 20,000 characters or fewer.",
        titleLong: "Shorten the title to 200 characters or fewer.",
        titleRfc: "Add a title. An RFC cannot be posted without one.",
        linkBad: "Start the link with http:// or https://, like https://example.com.",
        linkLong: "Shorten the link to 2,048 characters or fewer.",
        refused: "This could not be accepted. Look for an unusual character and try again.",
        unknownTopic: "One of the topics is not known. Remove it and try again.",
        tooManyTopics: "A post can have 5 topics at most. Remove some.",
        duplicateTopics: "A topic was chosen twice. Remove one.",
        hubMilestone: "This kind of post cannot be written here. Choose another kind.",
        nothingChanged: "Nothing has changed, so there is nothing to save.",
        publish: "We couldn't publish your post. Nothing was lost, so try again.",
        save: "We couldn't save your changes. Nothing was lost, so try again.",
      },
      notYours: { title: "This is not your post", text: "Only its author can edit it.", action: "Back to the post" },
    },
    post: {
      pageTitle: "A post | Village Sqwhere",
      back: "Feed",
      edited: "Edited {time}",
      commentsSoon: "Comments are coming soon. Until then, you can only see how many there are.",
      edit: "Edit post",
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
        text: "Ce que vous partagez s'affichera ici. Écrivez ce que vous avez appris, ou posez la question qui vous bloque.",
        action: "Écrire votre première publication",
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
    write: "Écrire une publication",
    done: { published: "Publication mise en ligne", saved: "Modifications enregistrées" },
    topics: {
      everyone: "Toutes les publications sont affichées",
      choose: "Choisir des sujets",
      change: "Changer les sujets",
      about: "Publications affichées sur {topics}",
      and: "{list} et {last}",
      more: "{list} et {n} autres",
      own: "Vos propres publications s'affichent toujours.",
      label: "Sujets de votre fil",
      help: "Choisissez les sujets que vous voulez voir. Enregistrez sans rien choisir pour tout voir.",
      save: "Enregistrer",
      cancel: "Annuler",
      failed: "Nous n'avons pas pu enregistrer vos sujets. Rien n'a été modifié, réessayez.",
    },
    compose: {
      pageTitle: "Écrire une publication | Village Sqwhere",
      newTitle: "Écrire une publication",
      editTitle: "Modifier votre publication",
      kindLabel: "Type de publication",
      general: "Général",
      hints: {
        general: "Tout ce que vous voulez partager.",
        question: "Un point où vous bloquez, ou sur lequel vous voulez des avis.",
        architecture_challenge: "Une décision de conception dont vous voulez discuter.",
        code_review_request: "Du code que vous aimeriez faire relire par un autre développeur.",
        oss_release: "Une nouvelle version ou un projet que vous publiez.",
        rfc: "Une proposition soumise aux commentaires. Elle exige un titre.",
        research_note: "Ce que vous avez appris en étudiant un sujet.",
      },
      fixedKind: "Le type ne peut plus être changé après la publication.",
      fixedTopics: "Les sujets ne peuvent plus être changés après la publication.",
      noTopics: "Aucun",
      title: {
        label: "Titre",
        optional: "facultatif",
        required: "obligatoire pour une RFC",
        help: "Une courte accroche. Sans titre, la première ligne de votre texte la remplace.",
        rfcHelp: "Une RFC est une proposition soumise aux commentaires, elle exige donc un titre.",
      },
      body: { label: "Texte", help: "Texte brut. Les retours à la ligne sont conservés, rien n'est mis en forme." },
      link: { label: "Lien", optional: "facultatif", help: "Une adresse web qui commence par http:// ou https://." },
      topics: {
        label: "Sujets",
        optional: "facultatif",
        help: "Jusqu'à 5 technologies dont parle votre publication.",
        full: "Vous avez choisi 5 sujets, le maximum pour une publication. Retirez-en un pour en choisir un autre.",
      },
      count: "{n} sur {max}",
      publish: "Publier",
      saveChanges: "Enregistrer les modifications",
      cancel: "Annuler",
      errors: {
        bodyEmpty: "Écrivez quelque chose dans le texte. Une publication ne peut pas être vide.",
        bodyLong: "Raccourcissez le texte à 20\u202f000 caractères au plus.",
        titleLong: "Raccourcissez le titre à 200 caractères au plus.",
        titleRfc: "Ajoutez un titre. Une RFC ne peut pas être publiée sans titre.",
        linkBad: "Commencez le lien par http:// ou https://, par exemple https://exemple.com.",
        linkLong: "Raccourcissez le lien à 2\u202f048 caractères au plus.",
        refused: "Ceci n'a pas pu être accepté. Cherchez un caractère inhabituel et réessayez.",
        unknownTopic: "L'un des sujets n'est pas connu. Retirez-le et réessayez.",
        tooManyTopics: "Une publication a 5 sujets au plus. Retirez-en quelques-uns.",
        duplicateTopics: "Un sujet a été choisi deux fois. Retirez-en un.",
        hubMilestone: "Ce type de publication ne peut pas être écrit ici. Choisissez-en un autre.",
        nothingChanged: "Rien n'a changé, il n'y a donc rien à enregistrer.",
        publish: "Nous n'avons pas pu publier. Rien n'est perdu, réessayez.",
        save: "Nous n'avons pas pu enregistrer vos modifications. Rien n'est perdu, réessayez.",
      },
      notYours: { title: "Ce n'est pas votre publication", text: "Seul son auteur peut la modifier.", action: "Retour à la publication" },
    },
    post: {
      pageTitle: "Une publication | Village Sqwhere",
      back: "Fil",
      edited: "Modifiée {time}",
      commentsSoon: "Les commentaires arrivent bientôt. D'ici là, vous pouvez seulement voir leur nombre.",
      edit: "Modifier la publication",
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
