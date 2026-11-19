import { expect, test } from "vitest";

import { copy as appFrame } from "./app-frame-copy";
import { copy as authCallback } from "./auth-callback/copy";
import { copy as feed } from "./feed/copy";
import { copy as hubs } from "./hubs/copy";
import { copy as ideas } from "./ideas/copy";
import { copy as landing } from "./landing/copy";
import { copy as matcherDemo } from "./landing/sections/matcher-demo-copy";
import { copy as closingBand } from "./landing/sections/closing-band-copy";
import { copy as faq } from "./landing/sections/faq-copy";
import { copy as greenTick } from "./landing/sections/green-tick-copy";
import { copy as howItWorks } from "./landing/sections/how-it-works-copy";
import { copy as hubPhases } from "./landing/sections/hub-phases-copy";
import { copy as principles } from "./landing/sections/principles-copy";
import { copy as onboarding } from "./onboarding/copy";
import { ROLES, TECHNOLOGIES, TOPICS } from "./onboarding/options";
import { copy as people } from "./people/copy";
import { copy as profile } from "./profile/copy";
import { copy as reducedMotionNotice } from "./reduced-motion-notice-copy";
import { copy as reviews } from "./reviews/copy";
import { copy as signIn } from "./sign-in/copy";
import { copy as tour } from "./tour/copy";
import { copy as interview } from "./verification-interview/copy";
import { copy as verification } from "./verification/copy";
import { copy as village } from "./village/copy";

// The special spaces and hyphen, written as character codes so this file holds no invisible
// character itself.
const NARROW_NO_BREAK_SPACE = String.fromCharCode(0x202f);
const NO_BREAK_HYPHEN = String.fromCharCode(0x2011);
const NO_BREAK_SPACE = String.fromCharCode(0xa0);

// every string in a value, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const french = strings([
  appFrame.fr,
  authCallback.fr,
  feed.fr,
  hubs.fr,
  ideas.fr,
  landing.fr,
  matcherDemo.fr,
  closingBand.fr,
  faq.fr,
  greenTick.fr,
  howItWorks.fr,
  hubPhases.fr,
  principles.fr,
  onboarding.fr,
  people.fr,
  profile.fr,
  reducedMotionNotice.fr,
  reviews.fr,
  signIn.fr,
  tour.fr,
  verification.fr,
  village.fr,
  interview.fr,
  ROLES.map((role) => [role.name.fr, role.hint.fr]),
  TECHNOLOGIES.map((tech) => tech.name.fr),
  TOPICS.map((topic) => topic.name.fr),
]);

// shows the invisible spaces, so a failure says what is really in the text
const visible = (text: string) =>
  text.replaceAll(NARROW_NO_BREAK_SPACE, "[U+202F]").replaceAll(NO_BREAK_SPACE, "[U+00A0]");

const isDigit = (char: string | undefined) => char !== undefined && /\d/.test(char);

// the French typography rules (docs/design-system/voice-and-tone.md), as a list of faults
function faults(text: string): string[] {
  const found: string[] = [];
  [...text].forEach((char, i) => {
    const before = text[i - 1];
    const after = text[i + 1];
    // a colon between digits is a time (0:30) and one before // is a URL: neither is punctuation
    const isClock = char === ":" && isDigit(before) && isDigit(after);
    const isUrl = char === ":" && after === "/";
    const needsSpaceBefore = ("?!;".includes(char) || char === ":") && !isClock && !isUrl;
    if (needsSpaceBefore && before !== NARROW_NO_BREAK_SPACE) found.push(`before ${char}`);
    if (char === "«" && after !== NARROW_NO_BREAK_SPACE) found.push("after «");
    if (char === "»" && before !== NARROW_NO_BREAK_SPACE) found.push("before »");
  });
  if (/e-mail/i.test(text)) found.push("e-mail has a plain hyphen");
  return found;
}

test("there is French copy to check", () => {
  expect(french.length).toBeGreaterThan(100);
});

test("French puts a narrow no-break space before ? ! ; and :, and inside « »", () => {
  const wrong = french.flatMap((text) =>
    faults(text).map((fault) => `${fault}: ${visible(text)}`),
  );
  expect(wrong).toEqual([]);
});

test("French writes e-mail with a non-breaking hyphen", () => {
  const withEmail = french.filter((text) => /e.mail/i.test(text));
  expect(withEmail.length).toBeGreaterThan(0);
  for (const text of withEmail) expect(text).toContain(`e${NO_BREAK_HYPHEN}mail`);
});
