# Comments and replies on posts

## Context

Posts are merged (#88, #90, #91), and comments are the next nine rows in the endpoint
tracker. The schema already has `comments` (with replies as rows that have a parent),
`comment_revisions` and `comment_likes`, plus triggers that keep counts and tree position
right. Some questions were still open:

- How deep can replies go?
- What happens to a deleted comment and its replies?
- What does a bad `parent_id` return?
- What happens when a comment races a delete?

## Decision

Tanny gave the feed and posts API to one session. That session chose the following:

1. **Replies nest up to depth 1000, the schema's limit.** The API adds no lower limit. A
   reply to a comment already at depth 1000 gets 422 `MAX_DEPTH_EXCEEDED`, not a 500.
   The screen decides how deep to indent, and it can open a deeper part with the thread route
   that comes in a later pull request.
2. **A deleted comment is 404 `COMMENT_NOT_FOUND` on its own routes**, the same rule as
   deleted posts (`2026-11-11-posts-pagination-and-visibility.md`). Its replies stay. The list
   routes in the next pull request will show a deleted comment that still has replies as an
   entry with no author and no text, so those replies stay reachable. A comment whose post is
   deleted or belongs to a hub is also 404.
3. **A bad `parent_id` is 422 `PARENT_NOT_FOUND`.** This covers a parent that is missing,
   deleted, or on another post. It is a field in the body, not the address, so 404 would point
   at the wrong thing.
4. **Writes lock first, always the post before a comment.** A new comment locks the post,
   then the parent, the same order as the insert trigger. A delete also locks the post first,
   because its count trigger updates the post; locking the comment first could deadlock with a
   reply to it. An edit only changes the text, so it locks just the comment. A write that races
   a delete answers 404 or 422 instead of a 500. This follows the fix in #93.
5. **Lists will use offset paging with `next_offset`**, the same as posts. They will not use
   the keyset indexes in the schema, so the web app pages comments and posts the same way.

## Options we considered

- **A depth limit in the API, such as 3:** rejected. Nobody has asked for one. A limit can
  be added later without breaking a client that already sends replies.
- **Showing a deleted comment as an entry on its own route:** rejected for now. A permalink
  to a deleted comment is rare, and 404 matches posts.
- **Catching the trigger's errors instead of locking:** rejected. The trigger messages are
  for the database, and catching them would mean parsing error text.

## Consequences

- The web app can build comment boxes and replies now. Lists, the thread route and comment
  likes come in the next pull requests (tracker rows 67 to 75).
- A busy post briefly holds new comments in line while it is edited or deleted. That wait is
  milliseconds, and it is what makes those writes safe.
