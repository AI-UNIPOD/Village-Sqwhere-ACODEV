# Store post images in S3-compatible object storage

## Context

The database schema already reserves `post_attachments` for image object keys and metadata.
The API had no upload route or storage provider configured, and production storage credentials
will be supplied by deployment configuration later.

## Decision

Store image bytes in an S3-compatible object store. Keep the bucket, endpoint, credentials,
region and public base URL in environment variables. The API accepts uploads only when a bucket
and public base URL are configured.

## Options we considered

- Store files on the API host. This depends on persistent shared disk and does not fit multiple
  API instances reliably.
- Store image bytes in PostgreSQL. This would mix large media with relational data and backups.

## Consequences

The same API integration can run against AWS S3 or an S3-compatible service. Deployment must
provide credentials and a public URL mapping for the configured bucket. The API starts without
these values, but upload requests return a clear 503 until storage is ready.
