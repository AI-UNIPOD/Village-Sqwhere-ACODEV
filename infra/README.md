# infra

Infrastructure for local development and deployment.

## Local database

`docker-compose.yml` runs PostgreSQL 17 with the [pgvector](https://github.com/pgvector/pgvector)
extension, which the API uses for AI idea matching.

```bash
pnpm db:up      # start Postgres on localhost:5432
pnpm db:down    # stop it (data is kept in the db-data volume)
```

Scripts in `db/init/` run only when the volume is first created. To start from an empty
database, run `docker compose -f infra/docker-compose.yml down -v`, then `pnpm db:up`.

### The init scripts

They run in file name order, once, on an empty database:

| Script | What it holds |
|---|---|
| `001-extensions.sql` | The pgvector extension. |
| `002-schema.sql` | The tables, constraints and triggers. |
| `003-hub-terms.sql` | `hubs.terms`: the deal a hub owner sets for their hub, for example `{"ownership_model": "equal_split"}`. It must be a JSON object, it is set when the hub is created and the database refuses any later change. Each signature in `agreement_signatures` gets the hub's own terms copied into `terms_snapshot`, whatever the client sent, so every member signs exactly the same terms. |
| `004-test-agreement.sql` | One published agreement template, version 1, titled `TEST AGREEMENT (NOT LEGAL TEXT)`. Hubs can only be created on a published template, so this lets us build and test hubs. Running it twice is safe. |

**An existing local database does not get 003 or 004 by itself.** Rebuild it, which deletes
your local data:

```bash
docker compose -f infra/docker-compose.yml down -v
pnpm db:up
```

**The agreement in `004-test-agreement.sql` is fake and must be replaced before launch.**
Published templates cannot be edited (the database refuses it), so the real agreement text
goes in as version 2 in a new script, and `004` is then reviewed. Hubs created on version 1
keep pointing at the test text.

The local credentials (`village` / `village`) are for development only. They match
`DATABASE_URL` in the root `.env.example`.

CI uses the same image and credentials, and applies the same `db/init/` scripts in the same
order before the API tests (see the `api` job in `.github/workflows/ci.yml`). A new init
script therefore runs in CI too, and it must work on an empty database.

## Deployment (Systalink)

ACODev 2026 requires the app to run on Systalink's platform (platform.systalink.com).
The deployment setup is still to be written: hosting for `apps/web` and `apps/api`, a
managed Postgres with pgvector, and environment variables. Add it here, under
`infra/systalink/`, once the team has platform access.
