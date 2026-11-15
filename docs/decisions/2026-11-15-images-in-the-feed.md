# Images in the feed

## Context

The API stores and serves post images (`POST /v1/uploads`, `DELETE /v1/uploads/{id}`,
`GET /v1/post-images/{id}`; see `2026-11-15-post-images-in-postgres.md`), and every post comes
with `attachments`. The web app showed none of them and could not upload any. Tanny approved
the web side on 15 November 2026 ("images in the feeds").

## Decision

**What shows where.** A card shows a post's images after its text and before its link. One image
is full width, two sit side by side, three or four make a grid (three: the first across the top),
and with more than four the card shows four with "+N" on the fourth. Every image in a card leads
to the post's page. The page shows all images at the full width of its column, each linking to the
full-size image in a new tab. There is no lightbox: a plain link needs no script, no focus trap
and no extra code, and the browser already zooms, saves and shares an image it opens.

**No layout jump.** Each image sits in a box sized from the `width` and `height` the API sends
(the attributes and a CSS `aspect-ratio`), on the sunken surface colour, so the page keeps its
shape while pictures load. A single image in a card keeps its own shape, but a very tall or wide
one is cropped to between 4:5 and 2:1 so it cannot fill a phone screen. Images are lazy and
decoded off the main thread. An image that fails to load shows a line of text in its box.

**Plain `<img>`, not `next/image`.** The API serves the bytes as stored, the address is public and
needs no sign-in, and Next's image optimiser is not set up and would only add a second hop. The
address is `API_URL` plus the relative `url` (`imageSrc` in `feed/feed-api.ts`), because on Vercel
the API shares the web's domain and locally it does not.

**Generic alt text.** The API has no alt field, so every image reads "Image 2 of 3 attached to
this post" (French: "Image 2 sur 3 jointe à cette publication"). This tells a screen reader a
picture is there and where it sits, and nothing about what it shows. An alt-text field on
`post_attachments`, and a box for it in the composer, is a later API change and then a web one.

**Limits, checked in the browser first.** JPEG, PNG or WebP, at most 4 MB (`4 * 1024 * 1024`
bytes) per file, at most 10 images per post, existing images included. 4 MB is the API's limit,
chosen so the form around the file stays inside Vercel's 4.5 MB request cap. 10 is the API's cap
per post. A refused file gets a sentence naming it and the reason, and the other files are kept.
The API checks the same rules again (it judges a file's type from its content, not from its
name), so the page's check is there to save a failed upload, not to be the guard.

**Upload after create.** The API takes the post's id in the upload form, so the post is made
first (or saved, on an edit) and the images go up one request each, in the order chosen, with
"Uploading image 2 of 3" in a polite live region. When an upload fails after the post exists, the
post is not lost: the form becomes the edit form of that post, keeps the files that did not go up,
says "Your post is published, but 1 image did not upload. Try again or leave it out." with the
reason from the API's code, and offers "Try again" (only the files left) and "Leave it out" (to the
post). Every file is tried, so one bad file does not hold back the others. The demo account's
refusal (`DEMO_READ_ONLY`) of the post ends the send before any upload, and on an edit it ends the
send at the first upload; either way the page says "Nothing was saved" beside the button, as the
rest of the feed does.

**Removing on edit.** The edit form lists the post's images with a Remove button each, which calls
`DELETE /v1/uploads/{id}` (204) and takes the image out of the list when it is gone. That route is
what makes removal possible without deleting the post. More images can be added in the same
form, and they go up when the person saves, within the 10 in all.

**The demo.** The demo account's writes are refused, so nothing is saved and no upload is tried.
Its posts get pictures in a separate seed pull request, so the feed has something to show.

## Options we considered

- **`next/image`.** Rejected: no optimiser is set up, and Vercel's CDN already caches the bytes
  for an hour.
- **A lightbox.** Rejected for now: a script, a focus trap and keyboard handling for something a
  link to the image already does.
- **Uploading before the post exists.** The API needs the post's id, so this would need a draft
  post or a second kind of upload address.
- **Stopping at the first failed upload.** A bad file would then hold back good ones behind it.
- **Alt text from the first line of the post.** It would be wrong as often as right, and a wrong
  description is worse than a plain one.

## Consequences

- A post's pictures are seen in the list without opening it, and a developer can show a diagram or
  a screenshot with their text.
- Full-size phone photos are over 4 MB, so many will be refused until the page shrinks images
  before sending. That is the first thing to add if people hit it.
- Screen reader users learn that a picture exists but not what it shows, until the alt field exists.
- Keeping the files that failed means a person can leave the composer with unsent files; closing
  the tab asks first, as it does for unsent text.
- Each image costs one request on upload, so a post with 10 images makes 11.
