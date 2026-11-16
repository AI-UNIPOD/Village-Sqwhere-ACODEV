# Keep post images in Postgres

## Context

`POST /v1/uploads` lets a post's author attach up to 10 images. The first version of this
pull request sent the bytes to an S3-compatible bucket and gave each image a public bucket
address. That needed a bucket, public access to it, six settings and `boto3`. We already run
Postgres on Neon, and image uploads are rare while the project is being judged.

The API runs on Vercel, which refuses any request or response over 4.5 MB. Uploads go through
the API either way, so a 5 MB cap could never be reached on the live site.

## Decision

Tanny chose to keep the image bytes in Postgres for now, in `post_attachments.data`
(`infra/db/init/027-post-image-bytes.sql`). The API serves them at
`GET /v1/post-images/{attachment_id}`, without a token, because an `<img>` tag cannot send
one. The random ID keeps an image private, as a bucket address would. The cap is 4 MB, which
leaves room for the form around the file inside Vercel's limit. Pillow still checks that the
file is a real JPEG, PNG or WebP.

The column is deferred in the model, so a feed page reads the image facts without the bytes.
Images are cached for an hour (`s-maxage=3600`), so repeat views come from Vercel's CDN.

## Options we considered

- An S3-compatible bucket. It suits many large images, but it adds an account, settings and
  a dependency for a feature few people will use yet.
- Files on the API host. Vercel functions have no lasting disk.

## Consequences

- No new settings and no `boto3`; images restore with their posts in a Neon backup.
- Images count toward Neon's storage (about 0.5 GB on the free plan) and its history. Full
  size phone photos fill that after a few hundred, so shrinking images on upload is the first
  thing to add if uploads grow.
- An image no cache holds costs one function call and one database read.
- A deleted post's image can still come from a cache for up to an hour.
- Moving to a bucket later means copying `data` out and filling `storage_key` again.
