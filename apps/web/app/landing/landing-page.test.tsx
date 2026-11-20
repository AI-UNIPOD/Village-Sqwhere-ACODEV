import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { LandingPage } from "./landing-page";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  // jsdom cannot draw, so the hero shows its still frame
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test.each([
  ["en", "Builders across Africa, one square."],
  ["fr", "Toute l'Afrique, une seule place."],
] as const)("the %s page opens with its headline", (lang, headline) => {
  render(<LandingPage lang={lang} />);
  expect(screen.getByRole("heading", { level: 1, name: headline })).toBeTruthy();
});

test.each([
  ["en", "Matcher", "Hub", "FAQ"],
  ["fr", "Matcher", "Espace", "FAQ"],
] as const)("the %s header links to the matcher, the hub and the questions", (lang, matcher, hub, faq) => {
  const { container } = render(<LandingPage lang={lang} />);
  const header = within(container.querySelector("header")!);
  for (const [name, id] of [
    [matcher, "matcher"],
    [hub, "hub"],
    [faq, "faq"],
  ]) {
    expect(header.getByRole("link", { name }).getAttribute("href")).toBe(`#${id}`);
    expect(container.querySelector(`#${id}`)).not.toBeNull();
  }
});

test("the sections come in the order of the story: matcher, how it works, hub, Green Tick, questions", () => {
  const { container } = render(<LandingPage lang="en" />);
  const ids = Array.from(container.querySelectorAll("main section[id]")).map((section) => section.id);
  expect(ids.filter((id) => ["matcher", "how", "hub", "green-tick", "faq"].includes(id))).toEqual([
    "matcher",
    "how",
    "hub",
    "green-tick",
    "faq",
  ]);
});

// jsdom has no layout, so this reads the stylesheet: on phones the section links take a row of
// their own under the logo and the switches, and on wide screens they share the one row.
test("on phones the section links get a row of their own, and not on wide screens", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  const [phone, wide] = [...css.matchAll(/\.navLinks \{([^}]*)\}/g)].map((m) => m[1]);
  expect(phone).toContain("flex: 0 0 100%;");
  expect(wide).toContain("flex: 0 1 auto;");
});

// On phones the links row is centred; wide screens keep the links in the header's one row,
// with nothing added to centre them.
test("on phones the section links are centred, and wide screens are unchanged", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toMatch(/@media \(max-width: 767px\) \{ \.navLinks \{ justify-content: center; \} \}/);
  const wide = css.slice(css.indexOf("@media (min-width: 768px) { .navLinks {"));
  expect(wide.slice(0, wide.indexOf("} }") + 3)).not.toContain("justify-content");
});

// jsdom has no layout, so this reads the stylesheet: on phones the pinned pill's links are
// segments at least a finger wide, the section being read is filled, and every header and
// footer link reaches 44px with an invisible area that leaves the text where it is.
test("on phones the pinned pill is a segmented control of 44px links with a filled current section", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  const phone = css.slice(css.indexOf("@media (min-width: 360px) and (max-width: 767px) {"));
  expect(phone).toMatch(/\.nav\[data-pinned\] \.navLink \{[^}]*min-inline-size: var\(--tap-min\);/);
  expect(phone).toMatch(/\.nav\[data-pinned\] \.navLink\[aria-current="location"\] \{ background: color-mix\(in srgb, var\(--text\) 8%, transparent\); color: var\(--text\); \}/);
  expect(css).toMatch(/\.navLink::before, \.footLink::before \{[^}]*inset-inline: min\(0px, calc\(\(100% - var\(--tap-min\)\) \/ 2\)\);/);
  expect(css).toContain("top: calc(var(--pill-top) + env(safe-area-inset-top, 0px));");
});

test("every demo button is a real button, and the hero's has its line", () => {
  const { container } = render(<LandingPage lang="en" />);
  const demo = screen.getAllByRole("button", { name: "Try the demo" });
  expect(demo.length).toBeGreaterThanOrEqual(2);
  for (const button of demo) expect(button.hasAttribute("aria-disabled")).toBe(false);
  // the hero's line in full for wide screens, and its short form for phones
  const [full, short] = Array.from(container.querySelectorAll("#demo-note > span > span")).map((s) => s.textContent);
  expect(full).toBe("No sign-up. Look around everything in read-only mode. A short tour is inside.");
  expect(short).toBe("(no sign up)");
});

// jsdom has no layout, so this reads the stylesheet: the short line is hidden until a phone
// width, where it takes the place of the full one.
test("on phones the hero's demo line is cut to \"(no sign up)\"; wider screens read it in full", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toContain(".noteShort { display: none; }");
  expect(css).toContain("@media (max-width: 767px) { .noteFull { display: none; } .noteShort { display: inline; } }");
});

// the hero's actions, in order: everything you can press under the headline
function heroActions(headline: string) {
  const copy = screen.getByRole("heading", { level: 1, name: headline }).parentElement!;
  return Array.from(copy.querySelectorAll<HTMLElement>("a, button"));
}

test.each([
  ["en", "Builders across Africa, one square.", "Join the village", "Try the demo"],
  ["fr", "Toute l'Afrique, une seule place.", "Rejoindre le village", "Essayer la démo"],
] as const)("the %s hero has two doors: sign-in first, then the demo", (lang, headline, join, demo) => {
  render(<LandingPage lang={lang} />);
  const actions = heroActions(headline);
  expect(actions.map((action) => action.textContent)).toEqual([join, demo]);

  const [first, last] = actions;
  expect(first.getAttribute("href")).toBe(`/${lang}/sign-in`);
  expect(first.getAttribute("href")).toBe(`/${lang}/sign-in`);
  expect(last.tagName).toBe("BUTTON");
  expect(last.hasAttribute("aria-disabled")).toBe(false);
});

test("the demo note sits under the demo button, not under the first action", () => {
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return this.textContent?.startsWith("Try the demo") ? 320 : 0;
  });
  const { container } = render(<LandingPage lang="en" />);
  expect(container.querySelector<HTMLElement>("#demo-note")!.style.marginLeft).toBe("320px");
});

test.each([
  ["en", "Sign in"],
  ["fr", "Connexion"],
] as const)("the %s page links to its sign-in page from the header and the footer", (lang, name) => {
  render(<LandingPage lang={lang} />);
  const links = screen.getAllByRole("link", { name });
  expect(links).toHaveLength(2);
  for (const link of links) expect(link.getAttribute("href")).toBe(`/${lang}/sign-in`);
});

test.each([
  ["en", "AI UniPod, University of Lagos (opens in a new tab)", "Built at AI UniPod, University of Lagos (opens in a new tab) for ACODev 2026."],
  ["fr", "l'AI UniPod de l'Université de Lagos (s'ouvre dans un nouvel onglet)", "Conçu à l'AI UniPod de l'Université de Lagos (s'ouvre dans un nouvel onglet) pour l'ACODev 2026."],
] as const)("the %s footer credits the AI UniPod and links to its site in a new tab", (lang, name, line) => {
  render(<LandingPage lang={lang} />);
  const link = within(screen.getByRole("contentinfo")).getByRole("link", { name });
  expect(link.getAttribute("href")).toBe("https://aiunipod.unilag.edu.ng/");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.parentElement!.textContent).toBe(line);
});

test.each([
  ["en", "Nigeria flag"],
  ["fr", "Drapeau du Nigeria"],
] as const)("the %s footer shows the Nigeria flag right before the copyright", (lang, name) => {
  render(<LandingPage lang={lang} />);
  const flag = within(screen.getByRole("contentinfo")).getByRole("img", { name });
  // drawn inline, never an emoji, so Windows shows the flag and not two letters
  expect(flag.tagName.toLowerCase()).toBe("svg");
  expect(flag.parentElement!.firstElementChild).toBe(flag);
  expect(flag.parentElement!.textContent).toBe("© 2026 Village Sqwhere.");
});

// jsdom runs no animation, so this reads the stylesheet: the flag waves inside a
// no-preference block only, and with reduced motion its wind layer stays hidden.
test("the footer flag waves only when the visitor allows motion", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  const query = "@media (prefers-reduced-motion: no-preference) {";
  const start = css.indexOf(query);
  expect(start).toBeGreaterThan(-1);
  let end = start + query.length;
  for (let depth = 1; depth > 0; end++) {
    if (css[end] === "{") depth++;
    if (css[end] === "}") depth--;
  }
  const allowed = css.slice(start, end);
  const elsewhere = css.slice(0, start) + css.slice(end);
  expect(allowed).toContain("animation: flagRipple");
  expect(allowed).toContain("animation: flagWind");
  expect(elsewhere).not.toMatch(/animation: flag(Ripple|Wind)/);
  expect(elsewhere).toContain(".flagWind { display: none; }");
});

test("the French page says the same in French", () => {
  render(<LandingPage lang="fr" />);
  expect(screen.getAllByRole("button", { name: "Essayer la démo" }).length).toBeGreaterThanOrEqual(2);
  expect(
    screen.getAllByText("Sans inscription. Parcourez tout en lecture seule. Une courte visite guidée est incluse.")
      .length,
  ).toBeGreaterThanOrEqual(1);
});

test("has one main landmark and no empty links or buttons", () => {
  const { container } = render(<LandingPage lang="en" />);
  expect(screen.getAllByRole("main")).toHaveLength(1);
  for (const el of container.querySelectorAll("a, button")) {
    expect(el.textContent?.trim() || el.getAttribute("aria-label")).toBeTruthy();
  }
});

test("draws the logo from the Logo component, hidden from screen readers", () => {
  const { container } = render(<LandingPage lang="en" />);
  const logos = container.querySelectorAll('svg[fill="var(--logo)"]');
  expect(logos.length).toBeGreaterThanOrEqual(3); // header, hero square, footer
  for (const logo of logos) expect(logo.getAttribute("aria-hidden")).toBe("true");
});

// No hover boxes on the header's buttons: the theme icon says what it does, and its name tells a
// screen reader, in the page's language. The hero's motion button shows its words.
test.each([
  // the site opens in dark, so the button offers light
  ["en", "Français", "Switch to light mode", "Pause animation"],
  ["fr", "English", "Passer en mode clair", "Mettre l'animation en pause"],
] as const)("the %s page names its theme button in its own words, with no hover box", (lang, language, theme, motion) => {
  render(<LandingPage lang={lang} />);
  const tooltipOf = (host: Element) => host.querySelector("[data-tooltip]")?.textContent;
  // the language switch shows both languages, so it needs no tooltip
  expect(tooltipOf(screen.getByRole("link", { name: language }))).toBeUndefined();
  expect(tooltipOf(screen.getByRole("button", { name: theme }))).toBeUndefined();
  // the motion button is hidden until the hero script has placed it, so look past that
  const motionButton = screen
    .getAllByRole("button", { hidden: true })
    .find((b) => b.textContent?.includes(motion));
  expect(motionButton).toBeDefined();
  expect(motionButton!.querySelector("[data-tooltip]")).toBeNull();
});

// ---------- the footer ----------

// jsdom has no layout, so this reads the stylesheet: the legal line is centred at every width
// with one generous gap between its parts, and on phones the logo, its line and the links are
// centred too.
test("the footer's legal line is centred at every width, and its top part on phones", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toMatch(/\.legal \{[^}]*justify-content: center;[^}]*gap: var\(--space-3\) var\(--space-8\);[^}]*text-align: center;/);
  expect(css).toContain("@media (max-width: 767px) { .footGrid { justify-items: center; text-align: center; } .tag { margin-inline: auto; } .footList { justify-content: center; } }");
});

test.each(["en", "fr"] as const)("the %s credit is a card of its own, its place a link with an arrow", (lang) => {
  const { container } = render(<LandingPage lang={lang} />);
  const link = container.querySelector<HTMLAnchorElement>('footer a[href="https://aiunipod.unilag.edu.ng/"]')!;
  const card = link.parentElement!;
  expect(card.tagName).toBe("SPAN");
  expect(card.className).toMatch(/credit/);
  // the arrow is for the eye; the name still says the link opens in a new tab
  const arrow = link.querySelector("svg")!;
  expect(arrow.getAttribute("aria-hidden")).toBe("true");
  expect(link.textContent).toMatch(lang === "en" ? /\(opens in a new tab\)$/ : /\(s'ouvre dans un nouvel onglet\)$/);
});

// ---------- back to top ----------

test.each([
  ["en", "Back to top"],
  ["fr", "Retour en haut"],
] as const)("the %s page has a back-to-top button at the end of its main part, not in the footer", (lang, name) => {
  const { container } = render(<LandingPage lang={lang} />);
  const button = screen.getByRole("button", { name, hidden: true });
  expect(button.closest("main")).not.toBeNull();
  expect(button.closest("footer")).toBeNull();
  expect(container.querySelector("main")!.lastElementChild!.contains(button)).toBe(true);
});

test("back to top steps aside while the questions pass under it, so it never covers a question's arrow", () => {
  render(<LandingPage lang="en" />);
  const button = screen.getByRole("button", { name: "Back to top", hidden: true });
  const questions = document.querySelector("#faq [data-clear-of-to-top]")!;
  expect(questions.querySelectorAll("details").length).toBeGreaterThan(3);
  // the button floats 660 to 704 px down the screen
  let listTop = 2000;
  const box = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this === button) return { top: 660, bottom: 704 } as DOMRect;
    if (this === questions) return { top: listTop, bottom: listTop + 900 } as DOMRect;
    return { top: 0, bottom: 0 } as DOMRect;
  });
  Object.defineProperty(window, "scrollY", { configurable: true, value: window.innerHeight + 1 });
  const scroll = (top: number) => {
    listTop = top;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
  };

  scroll(2000); // the questions are further down
  expect(button.hasAttribute("data-shown")).toBe(true);
  scroll(500); // they pass under the button
  expect(button.hasAttribute("data-shown")).toBe(false);
  scroll(-1000); // they have gone by
  expect(button.hasAttribute("data-shown")).toBe(true);
  box.mockRestore();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

test("back to top shows once a screen down, then takes the page and the keyboard to the top", () => {
  const { container } = render(<LandingPage lang="en" />);
  const button = screen.getByRole("button", { name: "Back to top", hidden: true });
  expect(button.hasAttribute("data-shown")).toBe(false);

  const scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  Object.defineProperty(window, "scrollY", { configurable: true, value: window.innerHeight + 1 });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
  expect(button.hasAttribute("data-shown")).toBe(true);

  fireEvent.click(button);
  expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  // focus goes back to the top as well, to the headline
  expect(document.activeElement).toBe(container.querySelector("main h1"));

  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
  expect(button.hasAttribute("data-shown")).toBe(false);
});

// jsdom has no layout, so this reads the stylesheet: the dock is sticky to the bottom of the
// screen inside <main>, so it stops above the footer; hidden, the button cannot be tabbed to.
test("back to top floats at the bottom of the screen, stops above the footer, and hides fully", () => {
  const css = readFileSync(join(__dirname, "landing-page.module.css"), "utf8").replace(/\s+/g, " ");
  expect(css).toMatch(/\.toTopDock \{ position: sticky; z-index: 15; bottom: env\(safe-area-inset-bottom, 0px\);/);
  // 16px clear of the bottom of the screen while it floats, and of the footer at the end
  expect(css).toMatch(/\.toTop \{[^}]*margin-block-end: var\(--space-4\);/);
  expect(css).toMatch(/\.toTop \{[^}]*opacity: 0; visibility: hidden;/);
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.toTop, \.toTop\[data-shown\], \.toTop\[data-shown\]:active \{ transform: none; \} \}/);
});
