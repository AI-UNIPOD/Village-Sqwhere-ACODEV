# Posts pagination, visibility, and hub milestone deferral

Name: `2026-11-11-posts-pagination-and-visibility.md`

## Context

The Developer Exchange Feed (`posts`) requires clear visibility, pagination, and integrity rules. Four design questions needed resolution before building the endpoints:

1. `hub_milestone` posts require an active hub and member authorization. Hubs and memberships are not fully implemented across the app yet. Exposing them in the feed would leak confidential hub records.
2. The schema creates an index on `(created_at DESC, id DESC)` for keyset pagination, but the existing API routes use offset pagination (`limit + 1`).
3. Reading deleted posts could return a 404 error or a tombstone placeholder.
4. Posts allow up to 5 technology topics, but the database schema does not declare this limit.

## Decision

The team agreed on the following architectural choices:

1. **Defer `hub_milestone` creation**: Keep `HUB_MILESTONE` in the ORM enum so existing rows remain queryable. Reject creation with HTTP 422 `HUB_MILESTONE_NOT_SUPPORTED`. Filter `hub_id IS NULL` across every feed and post read path to protect confidential hub data.
2. **Offset pagination with `limit + 1`**: Use offset pagination (`limit` default 20, max 50; `offset` default 0) to match existing endpoints like verifications. Keyset pagination can be introduced later without breaking the response shape.
3. **HTTP 404 for deleted posts**: Deleted posts return HTTP 404 `POST_NOT_FOUND` on read, update, and delete. No public tombstone is returned.
4. **API enforcement for topics**: Enforce the 5-topic maximum and duplicate topic validation in the route with HTTP 422 `TOO_MANY_TOPICS` and `DUPLICATE_TOPICS`. Topics are immutable after creation.
5. **Deletion audit reasons**: Post authors delete with reason `author`. Moderators delete with reason `moderator`. When an author is also a moderator, the `author` reason takes precedence.

## Options we considered

1. **Implement `hub_milestone` authorization now**: Rejected because hubs, terms, and memberships are still evolving. Writing incomplete authorization guards risked data leaks.
2. **Keyset pagination immediately**: Rejected for initial endpoints to maintain consistency with `apps/api/app/api/v1/verifications.py`.
3. **Public tombstones**: Returning `[removed]` placeholders for deleted posts was rejected to simplify client rendering and caching.

## Consequences

- Hub milestone posts cannot be published until the hub system is complete.
- Read queries strictly filter `hub_id IS NULL` and `deleted_at IS NULL`.
- Clients receive consistent pagination metadata across API resources.
- The 5-topic limit is tested and enforced at the route level.
