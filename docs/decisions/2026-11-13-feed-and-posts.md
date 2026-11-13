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
  never carry a script, an image or a disguised link. Developers paste code and symbols that
  Markdown would mangle. In a list the body is cut at six lines.
- **The type is a small label, not a status pill with an icon.** It names a kind of post, and
  seven icons for seven kinds would say less than the words. A plain post shows no label.
- **A card has no whole-card link.** Its row holds buttons, and a button inside a link cannot
  be pressed reliably.

## What is left out, and why

- **Writing and editing a post** are another task's composer (`/posts/compose`). There is no
  Write button here, and nothing links to those addresses.
- **Comments.** Only creating one and reading one by id exist in the API; listing a post's
  comments does not yet. The card shows the number of comments and nothing more.

## Options we considered

- **The feed inside Ideas:** rejected, see above.
- **One feed with a filter for saved and mine:** rejected, the three lists come from three
  different calls and the saved list is ordered by when you saved, not by when it was written.
- **Waiting for the API before changing a like:** rejected, it makes the most common press the
  slowest part of the screen.
- **Rendering Markdown:** rejected for now. It needs a sanitiser and a dependency, and the API
  stores plain text.

## Consequences

- A seventh place would leave 51px for a 47px label, so the bar is full. Anything more needs a
  "More" place.
- Offset paging can repeat a post when new ones arrive while someone reads, so a page that
  repeats a post already shown is filtered.
- A post is not removed from the list the moment it is un-saved on Saved, so the count of
  posts there can be one or two higher than the API's until the next load.
