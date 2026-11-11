# Sign-in emails: only verified ones, from the provider, and never a blocker

## Context

At sign-up the API saved the email from the public GitHub profile and never marked it
verified. It asked for the `user:email` scope but never used it. Two problems followed:

- Unverified addresses were stored as if they were real.
- If the address already belonged to another account, the database refused it (a unique
  index that ignores capital letters), the callback turned that into `OAUTH_EXCHANGE_FAILED`,
  and the person could never sign in. Anyone can type any email with `PATCH /v1/me`, so
  someone could park on another person's address and block their sign-up.

Nothing in the code ever set `users.email_verified_at`.

## Decision

Chosen in this pull request, for the team to confirm in review.

- A small `EmailSource` interface in `apps/api/app/services/provider_emails.py` answers one
  question: which addresses does this provider vouch for, and which are verified? GitHub
  implements it with `GET /user/emails`. Bitbucket, when it is built, needs one new class and
  one line in the `EMAIL_SOURCES` registry. Until then Bitbucket sign-in still returns `503`.
- A new account gets the verified primary email, or else the first other verified one.
  GitHub noreply addresses are skipped. A saved email gets `email_verified_at`. If nothing
  qualifies, no email is saved.
- An email is a bonus and never a blocker. If another account has the address (compared
  ignoring capital letters), the account is created without it. If two sign-ups race and the
  unique index refuses the second, it is rolled back and retried once without the email. If
  the emails request fails for any reason, the account is created without an email.
- The code never writes an email address to a log line or an error message.

## Options we considered

- **Keep using the public profile email.** Not chosen: GitHub does not say it is verified,
  and many people hide it.
- **Refuse sign-in on a clash.** Not chosen: that is the bug.
- **Make the email unique only among verified emails.** This is the real fix for parking on
  someone's address, but it needs a database change, so it needs the team's approval first.
- **Send a confirmation link for typed-in emails.** Needs an email service, so it is a
  separate piece of work.
- **A full provider abstraction (token exchange, profile and emails) now.** Not chosen: only
  the email lookup is needed today, and Bitbucket does not exist yet.

## Consequences

- A person whose address clashes can sign in, and has no email until they add one.
- Using another verified address when the primary is unusable can save an address the person
  did not choose as their primary on GitHub. It is only shown to that person, but it is a
  privacy trade-off the team may want to revisit.
- Accounts that already exist are not changed, so none of them gain a verified email.
- `PATCH /v1/me` still accepts any email without proof. Someone can still take an address
  first, and the real owner then signs up without an email. A verified-only unique index
  would end that.
- Until `echo=True` in `apps/api/app/database.py` is turned off, SQLAlchemy still prints the
  values of every query, emails included.
