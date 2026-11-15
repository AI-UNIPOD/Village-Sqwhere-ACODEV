# The hero crowd gathers a team around your idea

## Context

On 14 November 2026 Tanny asked for a hero background that shows the product's idea in the
crowd of words behind the hero: people gathering around an idea, being invited and signing. A
preview round gave three crowd concepts. Tanny chose "Your idea gathers a team", with two
changes, in their words: "I like that, but I want the idea to be with the cursor, attached at
the end; when the mouse pauses somewhere it gathers a team; but I want the animation to be a
bit faster for this."

Tanny had also asked, earlier and explicitly, for "the two boxes separate with some space in
between like they were much earlier". The hero had since closed that gap: a strip between the
text and the square was kept clear, so it read as one empty gap and not as crowd.

## Decision

- **Two boxes with crowd between them.** The text box and the square are separate again. Side
  by side there is a band of crowd of at least `--space-16` (`--space-20` with 20px cells)
  between the text's clear zone and the square's; stacked there are 160px of crowd rows between
  them. The headline keeps its size targets, so the square is one cell smaller at some widths
  (12px cells at 1280 and 1440 wide, where it was 13px) and the stack starts about 15px sooner.
- **The pointer is the idea.** A chip, "Your idea", hangs just below and to the right of the
  pointer's tip and moves with it one to one. It only exists over the crowd, and only for a fine,
  hovering pointer. A pause of 250ms (not a second) gathers the team. The whole story from the
  pause to the closed ring takes 1.6s, against about 4s in the first preview: suggestion and
  gather together in 0.5s on `--ease-strong`, the invitations at 0.5s, the three signatures
  200ms apart. Moving lets the names go home over `--dur-modal`. The labels stay as long as the
  pointer stays.
- **A ghost idea for everyone else.** Phones, touch and an idle pointer see the same story told
  by a dashed chip that wanders slowly to a clear spot, away from both boxes. With the motion
  button off or reduced motion, one still frame shows a finished ring.
- **Holding the drift is replaced.** Resting on a word used to hold the drift. The pause now
  means something else, so the drift keeps going; the motion button is still the control for
  it. The English or French twin of a word under the pointer stays.
- **Builders in the crowd.** 18 made-up first names, a little stronger than the words, each
  with a made-up role. The landing's cast keep their roles (Hamza Backend, Thandiwe Mobile,
  Kidist Security). The crowd has no "score" and no "matcher" word.

## Options we considered

- **The ring around the pointer's position instead of the chip.** The owner wanted the idea
  attached to the pointer, so the chip is the idea and the ring forms around it.
- **A spring that lags the pointer.** Rejected: a tag that trails the cursor reads as slow
  where it should read as attached. The chip is not smoothed at all.
- **Keeping the clear strip between the boxes.** Rejected: it is what the owner asked us to
  undo. The cost is a narrower text box and a slightly smaller square.
- **Tall hero so a ring always fits.** Rejected: the first screen should still show the text
  and the square on a laptop. Where no ring fits around the pointer (a tight clearing, the
  band between the boxes), nothing gathers and only the chip shows. The ring slides up or
  down by at most 28px, then shrinks, before it gives up.

## Consequences

- **Honesty.** The people and roles are made up, and the page already says so. A role is all the
  suggestion uses: no score, no percentage, no presence dots, and nothing reads the idea's
  text. Lagoon (`--ai`) is used only while the matcher suggests; success green only on
  "Signed" and its ring segment; Laterite stays on the logo in the square and the headline's
  underline. Joining is an invitation or a request, then each person signs: there is no
  "approve team" step in the story.
- **The same hero on sign-in and onboarding.** `GatherHero` is shared, so the sign-in page and
  the onboarding welcome get the new layout and the story too, in their language.
- **Where it does not gather.** On a short window the clearings above and below the text may
  be too small for any ring, and nothing gathers there. If that turns out to be common, the
  fix is a taller hero, not a smaller ring.
- **French copy** ("Votre idée", "Proposé par rôle", "Invitation envoyée", "Demande à
  rejoindre", "Signé") needs a native review before launch.
