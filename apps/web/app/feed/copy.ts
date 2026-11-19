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
  /** A kind or a topic chosen in the address: the row of kinds, the line that says what shows, the links on a post. */
  filter: {
    kinds: string;
    all: string;
    kind: Record<Kind, string>;
    topic: string;
    showing: string;
    clear: string;
    seeKind: string;
    seeTopic: string;
    empty: Empty;
  };
  ago: string;
  postBy: string;
  opensNewTab: string;
  /** The images of a post, in a list and on its page. */
  images: { alt: string; broken: string; more: string };
  like: string;
  likeCount: string;
  save: string;
  likeFailed: string;
  saveFailed: string;
  /** Beside a control the API refused for the demo account. */
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
    images: {
      label: string;
      optional: string;
      add: string;
      help: string;
      onPost: string;
      removeNew: string;
      removeOld: string;
      remove: string;
      removeFailed: string;
      refused: { type: string; size: string; count: string };
      progress: string;
      partialOne: string;
      partialMany: string;
      partialSavedOne: string;
      partialSavedMany: string;
      reasons: { tooLarge: string; invalid: string; limit: string; notAuthor: string; gone: string; other: string };
      retry: string;
      leave: string;
    };
  };
  comments: {
    loading: string;
    loadFailed: string;
    none: string;
    noneText: string;
    write: string;
    help: string;
    post: string;
    count: string;
    reply: string;
    replyTo: string;
    edit: string;
    editLabel: string;
    save: string;
    cancel: string;
    delete: string;
    edited: string;
    verified: string;
    deleted: string;
    inReply: string;
    showAll: string;
    showSome: string;
    showOne: string;
    showMore: string;
    continueThread: string;
    allComments: string;
    more: string;
    moreFailed: string;
    repliesFailed: string;
    said: { posted: string; replied: string; saved: string; deleted: string };
    deleteConfirm: { title: string; text: string; withReplies: string; confirm: string; cancel: string };
    errors: {
      empty: string;
      long: string;
      refused: string;
      gone: string;
      depth: string;
      notAuthor: string;
      comment: string;
      reply: string;
      edit: string;
      delete: string;
    };
  };
  post: {
    pageTitle: string;
    back: string;
    edited: string;
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
    filter: {
      kinds: "Kinds of post",
      all: "All kinds",
      kind: {
        general: "General",
        question: "Questions",
        architecture_challenge: "Architecture challenges",
        code_review_request: "Code review requests",
        oss_release: "Open source releases",
        rfc: "RFCs",
        research_note: "Research notes",
      },
      topic: "Topic: {name}",
      showing: "Showing: {what}. Posts from every developer.",
      clear: "Clear the filter",
      seeKind: "{kind}: see posts of this kind",
      seeTopic: "{topic}: see posts on this topic",
      empty: {
        title: "No posts here yet",
        text: "Nobody has shared a post that matches this filter. Clear the filter to see the rest of the feed.",
        action: "Clear the filter",
      },
    },
    ago: "{time} ago",
    postBy: "Post by {name}",
    opensNewTab: "opens in a new tab",
    images: {
      alt: "Image {n} of {total} attached to this post",
      broken: "This image could not be loaded.",
      more: "and {n} more",
    },
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
        linkBad: "Start the link with http:// or https://, like https://github.com/your-team/your-project.",
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
      images: {
        label: "Images",
        optional: "optional",
        add: "Add images",
        help: "JPEG, PNG or WebP, up to 4 MB each. A post can have 10 images.",
        onPost: "Images on this post",
        removeNew: "Remove {name}",
        removeOld: "Remove image {n}",
        remove: "Remove",
        removeFailed: "We couldn't remove the image. The post is unchanged, so try again.",
        refused: {
          type: "{name} was not added. Only JPEG, PNG and WebP images can be uploaded.",
          size: "{name} was not added. It is over 4 MB.",
          count: "{name} was not added. A post can have 10 images at most.",
        },
        progress: "Uploading image {n} of {total}",
        partialOne: "Your post is published, but 1 image did not upload. Try again or leave it out.",
        partialMany: "Your post is published, but {n} images did not upload. Try again or leave them out.",
        partialSavedOne: "Your changes are saved, but 1 image did not upload. Try again or leave it out.",
        partialSavedMany: "Your changes are saved, but {n} images did not upload. Try again or leave them out.",
        reasons: {
          tooLarge: "{name} is over 4 MB.",
          invalid: "{name} is not a JPEG, PNG or WebP image the server can read.",
          limit: "A post can have 10 images at most, so {name} did not fit.",
          notAuthor: "Only the author of a post can add images to it.",
          gone: "The post could not be found.",
          other: "{name} could not be sent. Check your connection and try again.",
        },
        retry: "Try again",
        leave: "Leave it out",
      },
    },
    comments: {
      loading: "Getting the comments",
      loadFailed: "We couldn't load the comments. The post is still here, so try again.",
      none: "No comments yet",
      noneText: "Be the first to answer: share what you know, or ask what you would like to know.",
      write: "Write a comment",
      help: "Plain text. Line breaks are kept.",
      post: "Comment",
      count: "{n} of {max}",
      reply: "Reply",
      replyTo: "Reply to {name}",
      edit: "Edit",
      editLabel: "Edit your comment",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      edited: "Edited",
      verified: "Verified",
      deleted: "This comment was deleted",
      inReply: "In reply to {name}",
      showAll: "Show all {n} replies",
      showSome: "Show {n} replies",
      showOne: "Show 1 reply",
      showMore: "Show more replies",
      continueThread: "Continue this thread",
      allComments: "Back to all comments",
      more: "Show more comments",
      moreFailed: "We couldn't load more comments. The ones above are still here, so try again.",
      repliesFailed: "We couldn't load the replies. Try again.",
      said: { posted: "Comment posted", replied: "Reply posted", saved: "Comment saved", deleted: "Comment deleted" },
      deleteConfirm: {
        title: "Delete this comment?",
        text: "It will be removed for everyone, and you cannot bring it back.",
        withReplies: "Its replies stay, under a note that this comment was deleted.",
        confirm: "Delete comment",
        cancel: "Keep comment",
      },
      errors: {
        empty: "Write something first. An empty comment cannot be sent.",
        long: "Shorten the text to {max} characters or fewer.",
        refused: "This could not be accepted. Look for an unusual character and try again.",
        gone: "That comment was deleted. We loaded the comments again.",
        depth: "This thread is too deep to answer here. Reply to a comment higher up instead.",
        notAuthor: "Only the author can change this comment.",
        comment: "We couldn't post your comment. Nothing was lost, so try again.",
        reply: "We couldn't post your reply. Nothing was lost, so try again.",
        edit: "We couldn't save your changes. Nothing was lost, so try again.",
        delete: "We couldn't delete the comment. Nothing was changed, so try again.",
      },
    },
    post: {
      pageTitle: "A post | Village Sqwhere",
      back: "Feed",
      edited: "Edited {time}",
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
    filter: {
      kinds: "Types de publication",
      all: "Tous les types",
      kind: {
        general: "Général",
        question: "Questions",
        architecture_challenge: "Défis d'architecture",
        code_review_request: "Demandes de revue de code",
        oss_release: "Versions open source",
        rfc: "RFC",
        research_note: "Notes de recherche",
      },
      topic: "Sujet : {name}",
      showing: "Publications affichées : {what}. Elles viennent de tous les développeurs.",
      clear: "Retirer le filtre",
      seeKind: "{kind} : voir les publications de ce type",
      seeTopic: "{topic} : voir les publications sur ce sujet",
      empty: {
        title: "Aucune publication ici pour l'instant",
        text: "Personne n'a encore partagé de publication qui correspond à ce filtre. Retirez le filtre pour voir le reste du fil.",
        action: "Retirer le filtre",
      },
    },
    ago: "il y a {time}",
    postBy: "Publication de {name}",
    opensNewTab: "s'ouvre dans un nouvel onglet",
    images: {
      alt: "Image {n} sur {total} jointe à cette publication",
      broken: "Cette image n'a pas pu être chargée.",
      more: "et {n} autres",
    },
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
        linkBad: "Commencez le lien par http:// ou https://, par exemple https://github.com/votre-equipe/votre-projet.",
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
      images: {
        label: "Images",
        optional: "facultatif",
        add: "Ajouter des images",
        help: "JPEG, PNG ou WebP, 4\u202fMo au plus chacune. Une publication peut avoir 10 images.",
        onPost: "Images de cette publication",
        removeNew: "Retirer {name}",
        removeOld: "Retirer l'image {n}",
        remove: "Retirer",
        removeFailed: "Nous n'avons pas pu retirer l'image. La publication n'a pas changé, réessayez.",
        refused: {
          type: "Le fichier {name} n'a pas été ajouté. Seules les images JPEG, PNG et WebP sont acceptées.",
          size: "Le fichier {name} n'a pas été ajouté. Il dépasse 4\u202fMo.",
          count: "Le fichier {name} n'a pas été ajouté. Une publication a 10 images au plus.",
        },
        progress: "Envoi de l'image {n} sur {total}",
        partialOne: "Votre publication est en ligne, mais 1 image n'a pas été envoyée. Réessayez ou laissez-la de côté.",
        partialMany: "Votre publication est en ligne, mais {n} images n'ont pas été envoyées. Réessayez ou laissez-les de côté.",
        partialSavedOne: "Vos modifications sont enregistrées, mais 1 image n'a pas été envoyée. Réessayez ou laissez-la de côté.",
        partialSavedMany: "Vos modifications sont enregistrées, mais {n} images n'ont pas été envoyées. Réessayez ou laissez-les de côté.",
        reasons: {
          tooLarge: "Le fichier {name} dépasse 4\u202fMo.",
          invalid: "Le fichier {name} n'est pas une image JPEG, PNG ou WebP que le serveur peut lire.",
          limit: "Une publication a 10 images au plus, le fichier {name} n'a donc pas pu s'ajouter.",
          notAuthor: "Seul l'auteur d'une publication peut y ajouter des images.",
          gone: "La publication est introuvable.",
          other: "Le fichier {name} n'a pas pu être envoyé. Vérifiez votre connexion et réessayez.",
        },
        retry: "Réessayer",
        leave: "Laisser de côté",
      },
    },
    comments: {
      loading: "Chargement des commentaires",
      loadFailed: "Nous n'avons pas pu charger les commentaires. La publication est toujours là, réessayez.",
      none: "Aucun commentaire pour le moment",
      noneText: "Soyez le premier à répondre\u202f: partagez ce que vous savez, ou demandez ce que vous voulez savoir.",
      write: "Écrire un commentaire",
      help: "Texte brut. Les retours à la ligne sont conservés.",
      post: "Commenter",
      count: "{n} sur {max}",
      reply: "Répondre",
      replyTo: "Répondre à {name}",
      edit: "Modifier",
      editLabel: "Modifier votre commentaire",
      save: "Enregistrer",
      cancel: "Annuler",
      delete: "Supprimer",
      edited: "Modifié",
      verified: "Vérifié",
      deleted: "Ce commentaire a été supprimé",
      inReply: "En réponse à {name}",
      showAll: "Afficher les {n} réponses",
      showSome: "Afficher {n} réponses",
      showOne: "Afficher 1 réponse",
      showMore: "Afficher plus de réponses",
      continueThread: "Continuer ce fil",
      allComments: "Retour à tous les commentaires",
      more: "Afficher plus de commentaires",
      moreFailed: "Nous n'avons pas pu charger d'autres commentaires. Ceux du dessus sont toujours là, réessayez.",
      repliesFailed: "Nous n'avons pas pu charger les réponses. Réessayez.",
      said: { posted: "Commentaire publié", replied: "Réponse publiée", saved: "Commentaire enregistré", deleted: "Commentaire supprimé" },
      deleteConfirm: {
        title: "Supprimer ce commentaire\u202f?",
        text: "Il sera retiré pour tout le monde, et vous ne pourrez pas le récupérer.",
        withReplies: "Ses réponses restent, sous une note indiquant que ce commentaire a été supprimé.",
        confirm: "Supprimer le commentaire",
        cancel: "Garder le commentaire",
      },
      errors: {
        empty: "Écrivez d'abord quelque chose. Un commentaire vide ne peut pas être envoyé.",
        long: "Raccourcissez le texte à {max} caractères au plus.",
        refused: "Ceci n'a pas pu être accepté. Cherchez un caractère inhabituel et réessayez.",
        gone: "Ce commentaire a été supprimé. Nous avons rechargé les commentaires.",
        depth: "Cette discussion est trop profonde pour y répondre ici. Répondez plutôt à un commentaire plus haut.",
        notAuthor: "Seul l'auteur peut modifier ce commentaire.",
        comment: "Nous n'avons pas pu publier votre commentaire. Rien n'est perdu, réessayez.",
        reply: "Nous n'avons pas pu publier votre réponse. Rien n'est perdu, réessayez.",
        edit: "Nous n'avons pas pu enregistrer vos modifications. Rien n'est perdu, réessayez.",
        delete: "Nous n'avons pas pu supprimer le commentaire. Rien n'a été modifié, réessayez.",
      },
    },
    post: {
      pageTitle: "Une publication | Village Sqwhere",
      back: "Fil",
      edited: "Modifiée {time}",
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
