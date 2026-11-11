import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { PKCE_VERIFIER_KEY, SignInPage } from "./sign-in-page";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize?client_id=demo&state=abc";
const assign = vi.fn();
const fetchMock = vi.fn();
let search = "";

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const started = () => reply(200, { data: { authorize_url: AUTHORIZE_URL, expires_at: "2026-11-06T18:30:00Z" } });

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
    get search() {
      return search;
    },
  });
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  assign.mockReset();
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

test("the button carries the GitHub mark and is named by its label alone", () => {
  render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });
  const mark = button.querySelector("svg");
  expect(mark).not.toBeNull();
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
  expect(mark?.nextSibling?.textContent).toBe("Continue with GitHub");
});

test.each([
  ["en", "Find developers who want to build what you want to build. New here? The same button creates your account."],
  ["fr", "Trouvez des développeurs qui veulent construire ce que vous voulez construire. Nouveau ici ? Le même bouton crée votre compte."],
] as const)("the %s page says who it is for and that the same button creates an account", (lang, intro) => {
  render(<SignInPage lang={lang} />);
  expect(screen.getByText(intro)).toBeTruthy();
});

test.each([
  ["en", "Passer en français", "/fr/sign-in", "/en"],
  ["fr", "Switch to English", "/en/sign-in", "/fr"],
] as const)("the %s page links home and to the other language's sign-in", (lang, label, otherHref, homeHref) => {
  render(<SignInPage lang={lang} />);
  expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(otherHref);
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe(homeHref);
});

// Browser translation turned "Village Sqwhere" into "Village Square" and "EN" into "IN".
test.each([
  ["en", "Passer en français"],
  ["fr", "Switch to English"],
] as const)("the %s page keeps the brand name and the language switch out of translation", (lang, label) => {
  render(<SignInPage lang={lang} />);
  expect(screen.getByText("Village Sqwhere").getAttribute("translate")).toBe("no");
  expect(screen.getByRole("link", { name: label }).getAttribute("translate")).toBe("no");
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

// A native button turns Enter and Space into a click, so focus and click cover the keyboard.
test("the button is a native button that keyboard focus reaches", () => {
  render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });
  expect(button.tagName).toBe("BUTTON");
  button.focus();
  expect(document.activeElement).toBe(button);
});

test("a network failure shows an alert with try again, focuses it, and fails the first step", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<SignInPage lang="en" />);
  const button = screen.getByRole("button", { name: "Continue with GitHub" });

  fireEvent.click(button);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("We couldn't reach Village Sqwhere");
  await waitFor(() => expect(document.activeElement).toBe(alert));
  expect(button.getAttribute("aria-disabled")).toBe("false");
  expect(steps()[0]).toMatch(", failed");
  expect(assign).not.toHaveBeenCalled();
  // the message takes the trust lines' place right under the button
  expect(screen.queryByRole("link", { name: "No GitHub account? Create one on GitHub" })).toBeNull();
});

test("try again starts sign-in and clears the alert", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockImplementation(started);
  render(<SignInPage lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));
  await screen.findByRole("alert");

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL));
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a server without GitHub set up gets its own message", async () => {
  fetchMock.mockImplementation(() =>
    reply(503, { detail: { code: "PROVIDER_NOT_CONFIGURED", message: "Sign-in with github is not set up." } }),
  );
  render(<SignInPage lang="fr" />);
  fireEvent.click(screen.getByRole("button", { name: "Continuer avec GitHub" }));

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("La connexion avec GitHub n'est pas encore prête");
  await waitFor(() => expect(document.activeElement).toBe(alert));
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
});

test("any other failure says sign-in did not start", async () => {
  fetchMock.mockImplementation(() => reply(500, { detail: "boom" }));
  render(<SignInPage lang="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Continue with GitHub" }));

  expect((await screen.findByRole("alert")).textContent).toContain("Sign-in didn't start");
  expect(assign).not.toHaveBeenCalled();
});

test("with no error in the address, no alert shows", () => {
  render(<SignInPage lang="en" />);
  expect(screen.queryByRole("alert")).toBeNull();
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

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(title);
  expect(alert.textContent).toContain(text);
  await waitFor(() => expect(document.activeElement).toBe(alert));
  expect(steps()[0]).toMatch(lang === "en" ? ", failed" : ", échec");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("after a failure from GitHub, try again starts a new sign-in", async () => {
  search = "?error=ACCESS_DENIED";
  fetchMock.mockImplementation(started);
  render(<SignInPage lang="en" />);

  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

  await waitFor(() => expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL));
  expect(screen.queryByRole("alert")).toBeNull();
});
