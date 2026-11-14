import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { PKCE_VERIFIER_KEY, SIGN_IN_LANG_KEY, SignInPage } from "./sign-in-page";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize?client_id=demo&state=abc";
const assign = vi.fn();
const replace = vi.fn();
const fetchMock = vi.fn();
let search = "";

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const started = () => reply(200, { data: { authorize_url: AUTHORIZE_URL, expires_at: "2026-11-06T18:30:00Z" } });

const css = readFileSync(join(__dirname, "sign-in-page.module.css"), "utf8");

// the declarations of the first rule written exactly for `selector`
const rule = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? "" : css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
};

// the two steps, with the state word each one speaks
const steps = () => screen.getAllByRole("listitem").map((item) => item.textContent ?? "");

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
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
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", {
    assign,
    replace,
    get search() {
      return search;
    },
  });
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  assign.mockReset();
  replace.mockReset();
  search = "";
});

test.each([
  ["en", "Sign in to the village", "Continue with GitHub"],
  ["fr", "Connectez-vous au village", "Continuer avec GitHub"],
] as const)("the %s page shows its heading and one sign-in button", (lang, heading, button) => {
  render(<SignInPage lang={lang} />);
  expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
  expect(screen.getAllByRole("button", { name: button })).toHaveLength(1);
});

// Reveals never hide headings or lead text (docs/design-system/components.md, Motion). The hero
// keeps its own motion, but the words and the button are there the moment it places them.
test("the text block carries no entrance of its own", () => {
  render(<SignInPage lang="en" />);
  const heading = screen.getByRole("heading", { level: 1 });
  const items = [
    heading,
    heading.nextElementSibling,
    screen.getByRole("button", { name: "Continue with GitHub" }).parentElement,
    screen.getByRole("list", { name: "How signing in works" }),
    screen.getByRole("link", { name: "No GitHub account? Create one on GitHub" }).parentElement?.parentElement,
  ];
  for (const item of items) {
    expect(item?.className).not.toMatch(/rise/);
    expect(item?.getAttribute("style") ?? "").not.toMatch(/--i/);
  }
  const css = readFileSync(join(__dirname, "sign-in-page.module.css"), "utf8");
  expect(css).not.toMatch(/\.rise\b|@keyframes rise/);
});

test("the stylesheet changes layout only at the design system breakpoints", () => {
  const widths = [...css.matchAll(/(?:min|max)-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
  expect(widths.length).toBeGreaterThan(0);
  for (const width of widths) expect([768, 1100]).toContain(width);
});

test("the button carries the GitHub mark and is named by its label alone", () => {
  render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });
  const mark = button.querySelector("svg");
  expect(mark).not.toBeNull();
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
  expect(mark?.parentElement?.nextSibling?.textContent).toBe("Continue with GitHub");
});

test.each([
  ["en", "Find developers who want to build what you want to build. New here? The same button creates your account."],
  ["fr", "Trouvez des développeurs qui veulent construire ce que vous voulez construire. Nouveau ici ? Le même bouton crée votre compte."],
] as const)("the %s page says who it is for and that the same button creates an account", (lang, intro) => {
  render(<SignInPage lang={lang} />);
  expect(screen.getByText(intro)).toBeTruthy();
});

test.each([
  ["en", "Français", "/fr/sign-in", "/en"],
  ["fr", "English", "/en/sign-in", "/fr"],
] as const)("the %s page links home and to the other language's sign-in", (lang, label, otherHref, homeHref) => {
  render(<SignInPage lang={lang} />);
  expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(otherHref);
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe(homeHref);
});

// Browser translation turned "Village Sqwhere" into "Village Square" and "EN" into "IN".
test.each([
  ["en", "Français"],
  ["fr", "English"],
] as const)("the %s page keeps the brand name and the language switch out of translation", (lang, label) => {
  render(<SignInPage lang={lang} />);
  expect(screen.getByText("Village Sqwhere").getAttribute("translate")).toBe("no");
  expect(screen.getByRole("link", { name: label }).closest("[translate]")?.getAttribute("translate")).toBe("no");
});

test("says what is read from GitHub and links to GitHub to create an account", () => {
  render(<SignInPage lang="en" />);
  expect(screen.getByText("We read your GitHub profile and email address only.")).toBeTruthy();
  const link = screen.getByRole("link", { name: "No GitHub account? Create one on GitHub" });
  expect(link.getAttribute("href")).toBe("https://github.com/join");
});

test.each([
  ["en", ["GitHub asks you to approve", "You come back signed in"], "to do"],
  ["fr", ["GitHub vous demande de valider", "Vous revenez ici, connexion faite"], "à faire"],
] as const)("the %s page lists the two steps in order, both still to do", (lang, labels, state) => {
  render(<SignInPage lang={lang} />);
  const list = screen.getByRole("list");
  expect(list.tagName).toBe("OL");
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(steps()).toEqual([`1${labels[0]}, ${state}`, `2${labels[1]}, ${state}`]);
});

test("starts sign-in with a PKCE challenge, says so, then goes to GitHub", async () => {
  fetchMock.mockImplementation(started);
  render(<SignInPage lang="en" />);
  const status = screen.getByRole("status");
  expect(status.textContent).toBe("");

  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

  await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL));
  expect(status.textContent).toBe("Taking you to GitHub…");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toMatch(/\/v1\/auth\/oauth\/github\/start$/);
  const body = JSON.parse(init.body);
  expect(body.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(body.code_challenge_method).toBe("S256");
  expect(body.redirect_uri).toMatch(/\/v1\/auth\/oauth\/github\/callback$/);
  expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toMatch(/^[A-Za-z0-9_-]{43,}$/);
});

test("remembers the language sign-in started in, so the return comes back to it", async () => {
  fetchMock.mockImplementation(started);
  render(<SignInPage lang="fr" />);
  fireEvent.click(screen.getByRole("button", { name: "Continuer avec GitHub" }));
  await waitFor(() => expect(assign).toHaveBeenCalled());
  expect(sessionStorage.getItem(SIGN_IN_LANG_KEY)).toBe("fr");
});

test("someone already signed in goes straight on to onboarding", () => {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
  render(<SignInPage lang="fr" />);
  expect(replace).toHaveBeenCalledExactlyOnceWith("/fr/onboarding");
});

test("a visitor stays on the sign-in page", () => {
  render(<SignInPage lang="en" />);
  expect(replace).not.toHaveBeenCalled();
});

test.each([
  ["en", "Continue with GitHub", "in progress", "done"],
  ["fr", "Continuer avec GitHub", "en cours", "terminé"],
] as const)("the %s steps show the first one working, then done", async (lang, button, working, done) => {
  let finish: (response: Response) => void = () => {};
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)));
  render(<SignInPage lang={lang} />);

  fireEvent.click(screen.getByRole("button", { name: button }));
  await waitFor(() => expect(steps()[0]).toMatch(`, ${working}`));
  expect(steps()[1]).not.toMatch(`, ${working}`);

  // The step says it is working at the click, before the PKCE hash is ready and the request is
  // sent. Answering before then answers nothing, and the test waits for a redirect forever.
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  finish(new Response(JSON.stringify({ data: { authorize_url: AUTHORIZE_URL } }), { status: 200 }));
  await waitFor(() => expect(assign).toHaveBeenCalled());
  expect(steps()[0]).toMatch(`, ${done}`);
  expect(steps()[1]).toMatch(`, ${working}`);
});

test("while it works the button keeps its label and a second click sends nothing", async () => {
  fetchMock.mockImplementation(started);
  const { container } = render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });

  fireEvent.click(button);
  fireEvent.click(button);

  expect(button.getAttribute("aria-disabled")).toBe("true");
  expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
  await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

// From 768px the button is auto width, so a spinner placed on its own over the button's edge landed
// on the GitHub mark. Both live in the one slot before the label, stacked in one grid cell.
test("while sign-in starts the spinner shares the GitHub mark's slot before the label", async () => {
  fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
  render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });
  const mark = button.querySelector("svg");

  fireEvent.click(button);
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
  // The request is sent a moment after the click, once the PKCE hash is ready. Wait for it here:
  // a test that ends first leaves it to arrive in a later test, where it takes that test's answer.
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

  const slot = mark?.parentElement;
  expect(slot).not.toBe(button);
  expect(slot?.children).toHaveLength(2);
  expect(slot?.nextSibling?.textContent).toBe("Continue with GitHub");
  expect(button.children).toHaveLength(1);
});

test("the spinner is not placed on its own over the button", () => {
  expect(rule(".spinner")).not.toMatch(/position:\s*absolute/);
  expect(rule(".slot")).toMatch(/display:\s*grid/);
});

// A third-party mark carries no motion (components.md), so after --delay-spinner the mark is
// hidden at once while the spinner fades in; a fast start never flashes either.
test("the GitHub mark is hidden without motion when the spinner shows", () => {
  const out = rule('.slot[data-loading="true"] .mark');
  expect(out).toMatch(/visibility:\s*hidden/);
  expect(out).toMatch(/var\(--delay-spinner\)/);
  expect(out).not.toMatch(/animation/);
  expect(rule(".spinner")).toMatch(/var\(--delay-spinner\)/);
  expect(css).not.toMatch(/blur\(/);
});

// A native button turns Enter and Space into a click, so focus and click cover the keyboard.
test("the button is a native button that keyboard focus reaches", () => {
  render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });
  expect(button.tagName).toBe("BUTTON");
  button.focus();
  expect(document.activeElement).toBe(button);
});

test("a network failure shows a message with try again, focuses it, and fails the first step", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });

  fireEvent.click(button);

  const message = await screen.findByRole("group");
  expect(message.textContent).toContain("We couldn't reach Village Sqwhere");
  await waitFor(() => expect(document.activeElement).toBe(message));
  expect(button.getAttribute("aria-disabled")).toBe("false");
  expect(steps()[0]).toMatch(", failed");
  expect(assign).not.toHaveBeenCalled();
  // the message takes the trust lines' place right under the button
  expect(screen.queryByRole("link", { name: "No GitHub account? Create one on GitHub" })).toBeNull();
});

// Focus moving to the message reads it out. An alert role on the same element would read it twice.
test("a failure is announced once: focus lands on the message, named by its title", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<SignInPage lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

  const message = await screen.findByRole("group", { name: "We couldn't reach Village Sqwhere" });
  await waitFor(() => expect(document.activeElement).toBe(message));
  expect(screen.queryByRole("alert")).toBeNull();
  const description = document.getElementById(message.getAttribute("aria-describedby") ?? "");
  expect(description?.textContent).toBe(
    "The connection dropped before sign-in could start. Check your network, then try again.",
  );
});

// The message takes focus only so Try again comes next; it is not a control, so no ring.
test("the focused message draws no focus ring", () => {
  expect(rule(".message:focus")).toMatch(/outline:\s*none/);
});

// Leaving faster than the message arrives, so the cell is never blank.
test("the trust lines fade out over the exit time before they hide", () => {
  const hidden = rule('.trust[data-hidden="true"]');
  expect(hidden).toMatch(/opacity:\s*0/);
  expect(hidden).toMatch(/opacity var\(--dur-modal-out\)/);
  expect(hidden).toMatch(/visibility 0s linear var\(--dur-modal-out\)/);
});

test("try again starts sign-in and clears the message", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockImplementation(started);
  render(<SignInPage lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));
  await screen.findByRole("group");

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL));
  expect(screen.queryByRole("group")).toBeNull();
});

test("a server without GitHub set up gets its own message", async () => {
  fetchMock.mockImplementation(() =>
    reply(503, { detail: { code: "PROVIDER_NOT_CONFIGURED", message: "Sign-in with github is not set up." } }),
  );
  render(<SignInPage lang="fr" />);
  fireEvent.click(screen.getByRole("button", { name: "Continuer avec GitHub" }));

  const message = await screen.findByRole("group");
  expect(message.textContent).toContain("La connexion avec GitHub n'est pas encore prête");
  await waitFor(() => expect(document.activeElement).toBe(message));
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
});

test("any other failure says sign-in did not start", async () => {
  fetchMock.mockImplementation(() => reply(500, { detail: "boom" }));
  render(<SignInPage lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

  expect((await screen.findByRole("group")).textContent).toContain("Sign-in didn't start");
  expect(assign).not.toHaveBeenCalled();
});

// On plain http at a LAN address the browser has no crypto.subtle, so the challenge cannot be made.
test("a browser that cannot hash says sign-in did not start and sends nothing", async () => {
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes });
  render(<SignInPage lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

  expect((await screen.findByRole("group")).textContent).toContain("Sign-in didn't start");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("with no error in the address, no message shows", () => {
  render(<SignInPage lang="en" />);
  expect(screen.queryByRole("group")).toBeNull();
});

test.each([
  ["en", "ACCESS_DENIED", "Sign-in was cancelled", "You cancelled on GitHub"],
  ["fr", "ACCESS_DENIED", "La connexion a été annulée", "Vous avez annulé sur GitHub"],
  ["en", "INVALID_STATE", "That sign-in expired", "It took too long"],
  ["en", "OAUTH_EXCHANGE_FAILED", "We couldn't finish with GitHub", "Nothing was saved"],
  ["en", "SOMETHING_NEW", "We couldn't finish with GitHub", "Nothing was saved"],
] as const)("%s page: coming back from GitHub with %s shows its message", async (lang, code, title, text) => {
  search = `?error=${code}`;
  render(<SignInPage lang={lang} />);

  const message = await screen.findByRole("group");
  expect(message.textContent).toContain(title);
  expect(message.textContent).toContain(text);
  await waitFor(() => expect(document.activeElement).toBe(message));
  expect(steps()[0]).toMatch(lang === "en" ? ", failed" : ", échec");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("after a failure from GitHub, try again starts a new sign-in", async () => {
  search = "?error=ACCESS_DENIED";
  fetchMock.mockImplementation(started);
  render(<SignInPage lang="en" />);

  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

  await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL));
  expect(screen.queryByRole("group")).toBeNull();
});

