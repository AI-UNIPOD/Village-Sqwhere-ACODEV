# Writing an idea: one page, public and private parts kept apart

## Context

The API lets a developer keep an idea as a private draft, publish it for signed-in developers
and close it (`docs/decisions/2026-11-13-idea-lifecycle-and-privacy.md`). An idea has a public
`summary` and an optional confidential `details`. The web app needed a way to write one and a
place to see your own. The risk to design against is a developer pasting a confidential plan
into the field everyone can read, or publishing before they meant to.

## Decision

The web frontend's owner chose, on 13 November 2026:

- **One page, three parts, in this order:** "What everyone sees" (title and summary), "Only
  you see this" (the private brief, marked with a lock), and "What the idea needs" (stage and
  roles). Each part says who can read it before the first field. An idea has five fields, and
  short forms work best on one page (Baymard's checkout research found the layout matters less
  than the number of fields).
- **Addresses:** `/{lang}/ideas/mine` lists your ideas, `/{lang}/ideas/compose` writes a new
  one and `/{lang}/ideas/compose?id=` opens an existing one. `/{lang}/ideas` is kept for
  browsing open ideas.
- **Saving a draft and publishing are separate buttons.** Publish is the main button and asks
  first, in a dialog that says what becomes visible and that the brief stays private. With no
  role chosen it also says the matcher cannot suggest anyone. Closing asks too, and says a
  closed idea cannot be opened again, because the API has no reopen.
- **The form checks what the API checks** (title 5 to 150 characters, summary 20 to 1,000,
  brief up to 20,000), on save, and clears an error the moment its field is fixed. A count
  shows only when the text is within a tenth of its limit.
- **A save sends only the fields that changed,** so an unchanged title or summary does not
  make the database drop the idea's vector.
- **Nothing typed is lost on a failed save:** the text stays in the form with a message, and
  leaving the page with unsaved changes asks first.
- **A shared `ConfirmDialog`** (`app/confirm-dialog.tsx`) on the native `<dialog>`, as the
  design system asks for destructive actions.

## Options we considered

- **One question per screen, as in onboarding.** Good for four quick choices, slow for writing:
  a developer wants to see the summary while writing the brief.
- **Saving as you type.** The API needs a valid title and summary before it stores anything,
  and every save of the title or summary resets the idea's place in matching.
- **A live preview of the public card beside the form.** Useful on a wide screen, but it is a
  second layout to keep in step. The headings already say what is public.
- **Publishing without asking.** Publishing shows the idea to every signed-in developer, and
  closing is the only way back.

## Consequences

- The page keeps its state when you leave and come back in the same visit (the app keeps
  pages in memory), so the form is keyed by the idea's id and records a publish or a close
  before it leaves. A new screen that edits data must do the same.
- Browsing open ideas, matches for an idea and creating a hub from an idea are separate
  screens still to build. The matcher's routes are not on `main` yet.
- The role list is the web app's own copy of the nine roles, as in onboarding, until the API
  serves French names.
