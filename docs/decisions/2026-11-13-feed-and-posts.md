# The feed and the post page on the web

## Context

The API has had the Developer Exchange for a while (`/v1/feed`, `/v1/posts`,
`/v1/me/saved-posts`, likes and saves), and the web app had nowhere to read it. Writing and
editing a post, and a post's comments, are built by other tasks, so this one is the reading
side: what developers share, and the small things you do to a post (like, save).

## Decision

The web frontend's owner chose, on 13 November 2026:

- **The feed is a place of its own, second, after Village.** It is something a developer opens
  many times a day, as often as the village. Hiding it inside Ideas would suggest that posts are
  about ideas, and they are about everything developers know. It sits second because the village
  is home and the feed is what you come back for. The bottom bar on a phone now holds six
  places for a verified developer (the earlier decision said five at most), so it was measured
  at 360px in both languages: each place is 60px wide, the widest label (Reviews, Espaces) is
  47px, every label is on one line, and there is no horizontal scroll.
- **Three tabs, three addresses:** For you (`/feed`, `GET /v1/feed`), Saved (`/feed/saved`,
  `GET /v1/me/saved-posts`) and Yours (`/feed/mine`, `GET /v1/posts?author=<username>`). They
  are the three lists the API gives and they look the same as the three ideas tabs, so there is
  nothing new to learn. Three addresses, not one page with a switch, so each can be linked to
  and the app keeps each list as it was left.
- **Like and save are optimistic.** The button and the count change when pressed, the request
  goes after, and on a failure the button goes back and a sentence says it did not go through.
  A like or a save is small and almost always works, so waiting for the answer would make the
  screen feel slow for no gain. One request per button at a time: a second press while the first
  is out does nothing, so the same thing is never sent twice.
- **On Saved, an un-saved post stays until the list loads again.** A slip can be undone by
  pressing Save again, and the list does not jump under the finger.
- **The body is plain text.** Line breaks are kept and nothing is read as markup, so a post can
  never carry a script or a disguised link. Images are not part of the text: they are separate
  attachments (see `2026-11-15-images-in-the-feed.md`). Developers paste code and symbols that
  Markdown would mangle. In a list the body is cut at six lines.
- **The type is a small label, not a status pill with an icon.** It names a kind of post, and
  seven icons for seven kinds would say less than the words. A plain post shows no label.
- **A card has no whole-card link.** Its row holds buttons, and a button inside a link cannot
  be pressed reliably. Its title (or, with no title, the first line of its text) and its comment
  count lead to the post page.
- **A post has its own page, `/posts/view?id=`,** the way hubs and ideas do: the query string
  carries the id, and the page is keyed by it. The page marks Feed in the places bar, because a
  post is read in the feed (`AppFrame` treats the `posts` part of an address as the feed).
  A post that is deleted, or an id that is not a post's id (the API answers 404 or 422), shows
  one screen, "This post is gone", with the way back to the feed.
- **Only the author sees Delete, behind a confirmation,** and nothing else changes the post
  there. The API takes no reason from an author, so none is asked for. It also lets a platform
  moderator delete any post; the web app has no moderator screens, so it offers Delete to the
  author only. After a delete the person goes to Yours, which says "Post deleted" from the
  address (`?done=deleted`), so a reload or another tab never repeats it from stale state.

## What is left out, and why

- **Comments** were left out of the first version, because the API had no list of a post's
  comments then. They are built now: see "Comments" below.

## Options we considered

- **The feed inside Ideas:** rejected, see above.
- **One feed with a filter for saved and mine:** rejected, the three lists come from three
  different calls and the saved list is ordered by when you saved, not by when it was written.
- **Waiting for the API before changing a like:** rejected, it makes the most common press the
  slowest part of the screen.
- **Rendering Markdown:** rejected for now. It needs a sanitiser and a dependency, and the API
  stores plain text. Pictures come as attachments instead, not as markup in the text.

## Consequences

- A seventh place would leave 51px for a 47px label, so the bar is full. Anything more needs a
  "More" place.
- Offset paging can repeat a post when new ones arrive while someone reads, so a page that
  repeats a post already shown is filtered.
- A post is not removed from the list the moment it is un-saved on Saved, so the count of
  posts there can be one or two higher than the API's until the next load.

## Writing and editing a post

Added the same day, once the composer was built (`/posts/compose`, and `/posts/compose?id=` to
edit).

- **The kind and the topics are fixed after posting.** The API's edit request takes only the
  title, the text and the link (`PostUpdateRequest` forbids any other field), and its docs say
  topics and type are immutable. The edit form therefore shows the kind and the topics as plain
  text and says under each that it cannot be changed. Showing them as disabled controls would
  look broken instead of settled. A person who picked the wrong kind has to delete the post and
  write it again, which is the API's rule, not a choice made here.
- **Images are chosen under the text.** The form takes up to 10 JPEG, PNG or WebP images of 4 MB or
  less and sends them after the post is made; the edit form can also remove them. Why and how:
  `docs/decisions/2026-11-15-images-in-the-feed.md`.
- **The text is plain text, with no preview.** The post page shows a body as plain text, so
  what is typed is what is shown, line breaks included. A preview would show the same words in
  the same place and nothing more. The form says so under the field ("Plain text. Line breaks
  are kept, and nothing is formatted").
- **The RFC title rule appears with the kind.** An RFC needs a title (the API refuses one
  without, and refuses clearing one later). The label changes to "required for an RFC" the
  moment RFC is chosen, and the error goes the moment the kind or the title changes.
- **Most refusals are said before sending, the rest from the API's codes.** The page checks the
  text, title, link and topic count itself and says why in words. The API's own codes
  (`UNKNOWN_TOPIC`, `TOO_MANY_TOPICS`, `DUPLICATE_TOPICS`, `HUB_MILESTONE_NOT_SUPPORTED`,
  `RFC_TITLE_REQUIRED`, `EMPTY_UPDATE`, `NOT_POST_AUTHOR`, `POST_NOT_FOUND`) each have a
  sentence next to the field they are about. The API answers a model-level refusal (an RFC with
  no title) as a list-shaped 422 whose field is `body`, so that case cannot be told apart from
  a refused text by field; the page never sends it, because it checks first.
- **An edit sends only what changed, and nothing when nothing did.** Like the idea composer,
  which does the same, so an untouched field is not written again. A cleared title or link is
  sent as `null`, which is how the API clears them (an empty string is refused).
- **Leaving.** The idea composer only asks before the tab is closed (`beforeunload`), so the
  post composer does the same, through the same `useLeaveWarning`. There is no prompt for
  moving inside the app.
- **After a first publish the form is emptied before the person moves on.** The app keeps the
  page it left, so a form still holding the sent text could send the same post twice when the
  person comes back. The edit form holds the saved post instead. Both are keyed by the post's id.
- **The entry points:** one main "Write a post" button on all three tabs of the feed (so the
  Yours empty state leads to the same place with a quieter "Write your first post"), and Edit
  beside Delete for the author on the post page. Publishing and saving go to the post with
  `?done=published` or `?done=saved`, read from the address.

## Choosing the topics of your feed

- **The choice opens in place on For you, not on a page of its own and not in a dialog.** It is
  a small, repeatable preference that changes what the list under it shows, so it stays next to
  that list: one quiet line says what the feed shows ("Showing posts about Go and Python"), and
  its button opens the same chips used on the profile and in the composers. A dialog would hide
  the list it changes, and a page would be a trip for one setting. The button has
  `aria-expanded` and `aria-controls`, focus moves into the choice when it opens and back to the
  button when it closes (Save, Cancel or Escape), and the choice is not reachable while closed.
- **It moves like a menu:** `--dur-menu` in and `--dur-menu-out` out, opacity and a small
  upward translate, no translate with reduced motion. The panel is hidden with the `hidden`
  attribute and `display` is part of the transition, so the fade is seen on the way out too.
- **Saving replaces the whole list and loads the feed again from the top.** The request is
  `PUT /v1/me/feed-topics` with the key `technologies` (not `topics`). The API's answer is kept
  in the kept profile (`keepMe`, with `feed_topics` added to `Me`), so the line is right on every
  screen. Saving with nothing chosen means "show everything", which is the API's meaning of an
  empty list. A failed save keeps the choice open and says nothing was changed. Own posts always
  show on the feed whatever the topics (the API's rule), and the line says so once.
- **The line names up to three topics, then two and a count** ("Go, Python and 2 more"), in
  the order of the technologies list, so it reads the same after a reload.
- **Onboarding's topics are left alone.** Its topics step asks about ten sectors (fintech,
  agritech, health, education, climate and energy, mobility and logistics, commerce, civic tech,
  media and culture, developer tools; `TOPICS` in `app/onboarding/options.ts`, marked there as a
  draft list). The API's feed topics are technology slugs, and `GET /v1/technologies` returns
  the 19 technologies that `TECHNOLOGIES` already holds (react, go, python and so on). None of
  the ten sector slugs is among them, so saving them would be refused as `UNKNOWN_SLUG`, and
  mapping a sector to technologies would be inventing a meaning. Onboarding still throws its
  topics away, as before. The fix is a decision about the taxonomy (sectors need their own
  table in the API, or the step asks about technologies), not a web change.

## Comments

Added once the API listed a post's comments (`GET /v1/posts/{id}/comments` and
`GET /v1/comments/{id}/replies`). The section sits on the post page and replaces the line that
said comments were coming.

- **Threads open one level at a time.** The API gives a post's comments with their first two
  replies, and `GET /v1/comments/{id}/replies` gives the direct replies of one comment. It has no
  call for a whole thread (the thread route is not on `main` yet). So a comment shows what the list
  gave it, and a button ("Show all 3 replies", "Show 1 reply") loads one more level, a page of 20 at
  a time, with "Show more replies" when there are more. A reply can be answered, and its answers
  open the same way, to any depth. Whether a button is shown comes from what the API says it has not
  sent (`next_offset`), not from `reply_count`: that count includes deleted replies that no list
  returns, so it can be higher than the replies a person can ever open.
- **The indent stops after the third level.** Each level after the first moves in by 25px
  (two token spaces and a 1px line down its left), so a thread costs 50px of a 360px screen at
  most and any depth still fits. Deeper
  replies stay at the third level's indent, and each one says who it answers ("In reply to Ama
  Mensah"), taken from the comment above it, so the thread can still be followed. The API allows a
  depth of 1000, and the web does not limit it. If a reply is refused with `MAX_DEPTH_EXCEEDED` the
  form says to reply to a comment higher up.
- **A comment is liked like a post.** The first version had no button, because the route was not
  on `main`; it landed with #103, and the button changes the screen at once and sends the
  request after, as a post's does.
- **A deleted comment that still has replies stays as a quiet note.** The API lists it with
  `deleted: true` and no author or text, so its replies stay reachable, and the screen draws
  "This comment was deleted" with no buttons and the replies under it. When the person deletes
  their own comment the screen does the same thing the API will do on the next load: a comment with
  replies (`reply_count` above zero) becomes the note, a comment with none is removed. Either way
  the post's count goes down by one (it counts comments that are not deleted).
- **Delete is offered to the author only.** The API lets a moderator or an admin delete anyone's
  comment (reason `moderator`). The web app has no moderation screens, as with posts, so Edit and
  Delete are both for the author. The API lets nobody else edit.
- **A new comment goes where the API's order puts it.** The list is oldest first, so a comment
  just written goes after the others, and the screen scrolls to it and fades it in (only for the
  person's own action). If more pages are waiting, it sits after the pages loaded so far and stays
  last when they arrive: pages are merged by id and sorted by time, as the API sorts.
- **One box open at a time.** A reply or an edit opens in place under its comment, and opening
  another closes the first, so only the open one holds a draft. Closing puts focus back on the
  button that opened it. An edit that changes nothing sends nothing, because the API would mark the
  comment as edited.
- **The section is separate from the post.** It loads after the post, keyed by the post's id, and if
  it cannot load, the post stays and the section offers "Try again". A comment, reply, edit or delete
  that finds the comment gone (`COMMENT_NOT_FOUND`, `PARENT_NOT_FOUND`) says so and loads the list
  again. A post that is gone (`POST_NOT_FOUND`) shows the page's "This post is gone" screen.
- **A link from a card lands on the section.** The comment count on a card links to
  `/posts/view?id=...#comments`. The page is only tall enough to reach the section once the
  comments are in, so the scroll happens when the section appears and again when the comments load.
- **Edit and Delete post move above the comments.** The post's own actions stay near the post, not
  under a long thread.
