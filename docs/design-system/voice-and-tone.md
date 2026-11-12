# Voice and tone

Plain, warm, direct. We sound like a good teammate in a village square: we say what is
happening, what it means for you, and what to do next.

## Rules

- Short sentences in plain words. Say the specific thing: the name, the number, the city.
- Sentence case for everything: buttons, titles, labels.
- Buttons say what they do: "Send invite", not "Submit" or "OK".
- No hype: no "unleash", "supercharge", "AI-powered synergy". No exclamation marks in the
  interface.
- No em dashes or en dashes. Use a comma, a colon, a full stop or brackets.
- No emoji in the interface.
- Errors say what happened and what to do, and never blame the person. Say what was kept:
  "Your message is saved".
- Talk about building together, never about hiring. People are "developers", "builders"
  or "your team", never "talent" or "resources".
- The AI is the matcher or the hub assistant. It suggests; people decide.
- African context is normal, not decoration: Lagos, Dakar, Nairobi, naira and CFA
  amounts.

## English and French ship together

Every string exists in both languages in the same pull request. French is often longer,
so buttons and labels must have room to grow. Write the French yourself or ask a
French-speaking teammate; do not ship machine translation unchecked.

French punctuation follows French typography:

- A narrow no-break space (U+202F) goes before `?`, `!`, `;` and `:`, and inside « »:
  `Nouveau ici[U+202F]?`, `«[U+202F]{query}[U+202F]»`. Never an ordinary space and never
  none, so a `?` or a closing guillemet cannot wrap alone onto the next line on a phone.
- A colon between digits is a time (0:30) and a colon in a URL is not punctuation. Leave both.
- Write "e-mail" with a non-breaking hyphen (U+2011), so it never splits across two lines.
- In code, write these as `\u202f` and `\u2011` escapes, so they stay visible in a review.

| Moment | English | Français |
| --- | --- | --- |
| Main action | Send invite | Envoyer l'invitation |
| Skip | Not now | Pas maintenant |
| Slow connection | Matching is taking longer. The connection is slow. We'll show results here as they arrive. | La recherche prend plus de temps. La connexion est lente. Les résultats s'afficheront ici dès leur arrivée. |
| Field error | Enter a full email address, like ada@example.com. | Saisissez une adresse e‑mail complète, par exemple ada@example.com. |
| Empty state | No matches yet. Add two skills and we'll start looking. | Pas encore de correspondances. Ajoutez deux compétences et nous lancerons la recherche. |

## Instead of this, write this

| Instead of | Write |
| --- | --- |
| Oops! Something went wrong | We couldn't send your invite. The connection dropped. Your message is saved, so try again when you're back online. |
| Unleash your potential with AI-powered synergy | Share an idea. We'll find developers who want to build it with you. |
| Submit | Send invite |
| Invalid input | Add an @ and a domain, like name@example.com. |
| Loading... | Finding people who fit your idea |

## Names and data in examples

Use made-up people from across the continent, written correctly: Ọláolúwa Adébáyọ̀,
Aminata Ndiaye, Kwabena Ɔwusu, Ɗanladi Ƙabir, Wanjiru Kamau. Never use real users or real
ideas in designs, docs or screenshots.
