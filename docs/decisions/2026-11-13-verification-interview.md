# The verification interview screen

## Context

The second stage of a Green Tick is five questions from an AI interviewer over a WebSocket
(`/v1/me/verifications/<id>/interview`). The API ends the attempt for good if the socket
closes before the last answer, and each role allows three attempts. The screen has to make that
plain, never open the socket by accident, and cope with the socket dropping.

## Decision

- **The socket opens only from the "Begin the interview" press.** Not on render and not in an
  effect on mount. Before that, the screen checks the attempt with `GET /v1/me/verifications/<id>`
  and shows the intro, with a warning message that says closing the tab or losing the
  connection ends the attempt.
- **Ready means `in_progress` at `technical_defence`.** Any other state shows why (still being
  checked, answered, awaiting review, ended) with one link back. A 404 or a 422 (an id that is
  not a UUID) shows "We couldn't find this interview."
- **The token comes from `accessToken()` in `session.ts`,** which shares its refresh code with
  `apiFetch`. A socket address carries the token in the query string (the API's contract), so it
  must be fresh at the moment of connecting.
- **Never reconnect.** A second socket would find the attempt already ended. A close without
  `interview_complete` or our own abandon is shown as "The connection dropped", and a close
  before any message as "We couldn't start the interview".
- **Leaving is a confirmed action.** "Leave the interview" opens a native dialog that says it
  counts as one of the three attempts. Confirming sends `abandon` and shows the left screen at
  once, without waiting for the server's `interview_incomplete`. "Stay" comes first in the
  dialog so the browser focuses the safe choice.
- **A `beforeunload` warning is set while the interview is live** (connecting, asking or
  reading), and removed when it ends.
- **Validation happens in the browser too.** An empty answer, or one over 10,000 characters
  after trimming, shows the field error without a round trip. The server's `ANSWER_REQUIRED`
  and `ANSWER_TOO_LONG` use the same messages, and any other error code gets a generic
  "send again".
- **"Question N", never "N of 5":** the server sets the number of questions and does not send it.
- **`security_signal` frames are ignored:** they are for the reviewer, not the applicant.

## Options we considered

- **Reconnecting after a drop:** the API has already ended the attempt, so it would only fail.
- **Opening the socket on arrival, to save a click:** the warning would come too late.
- **A scroll box for the transcript, with the composer outside it:** needs a fixed page height
  that fights the header and the phone keyboard. A sticky composer under a page-length
  transcript follows the onboarding pattern.

## Consequences

- Voice answers exist in the API but are not part of this screen.
- The dialog has no leave animation, only an enter one.
- The left screen shows before the server confirms. If the `abandon` message were lost, closing
  the socket still ends the attempt on the server, so the screen is not wrong.
