import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { PKCE_VERIFIER_KEY } from "../sign-in/sign-in-page";
import { CallbackPage, SESSION_KEY } from "./callback-page";
import { copy } from "./copy";

const replace = vi.fn();
const fetchMock = vi.fn();
let search = "";

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const signedIn = () =>
  reply(200, {
    data: {
      access_token: "access-demo",
      token_type: "Bearer",
      expires_in: 900,
      refresh_token: "rt_demo",
      refresh_expires_at: "2026-12-11T10:00:00Z",
      is_new_user: true,
      user: { id: "u1", username: "ada-obi" },
    },
  });

const refused = () =>
  reply(401, { detail: { code: "LOGIN_CODE_INVALID", message: "This sign-in link is invalid." } });

function open(query: string, verifier: string | null = "verifier-demo") {
  search = query;
  if (verifier) sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
}

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", {
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
  vi.useRealTimers();
  fetchMock.mockReset();
  replace.mockReset();
  search = "";
});

test("an error from the API goes to the sign-in page, which explains it", () => {
  open("?error=ACCESS_DENIED");
  render(<CallbackPage lang="fr" />);
  expect(replace).toHaveBeenCalledExactlyOnceWith("/fr/sign-in?error=ACCESS_DENIED");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the error code is encoded in the address", () => {
  open("?error=" + encodeURIComponent("A&B=1"));
  render(<CallbackPage lang="en" />);
  expect(replace).toHaveBeenCalledWith("/en/sign-in?error=A%26B%3D1");
});

test("while the code is being exchanged, the page says it is finishing sign-in", async () => {
  open("?login_code=lc_demo");
  fetchMock.mockReturnValue(new Promise(() => {}));
  const { container } = render(<CallbackPage lang="en" />);
  expect(screen.getByRole("heading", { level: 1, name: "Finishing sign-in" })).toBeTruthy();
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
});

test.each(["en", "fr"] as const)("a good code signs in, saves the session and opens /%s/onboarding", async (lang) => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-11T10:00:00Z") });
  open("?login_code=lc_demo", "verifier-demo");
  fetchMock.mockReturnValue(signedIn());
  render(<CallbackPage lang={lang} />);

  await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith(`/${lang}/onboarding`));

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://localhost:8000/v1/auth/token");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({
    grant_type: "login_code",
    login_code: "lc_demo",
    code_verifier: "verifier-demo",
  });

  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({
    access_token: "access-demo",
    refresh_token: "rt_demo",
    expires_at: "2026-11-11T10:15:00.000Z",
    refresh_expires_at: "2026-12-11T10:00:00Z",
  });
  expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBeNull();

  const status = screen.getByRole("status");
  expect(status.textContent).toContain(copy[lang].success.title);
  expect(status.textContent).toContain(copy[lang].success.text);
});

test("the user profile is not stored", async () => {
  open("?login_code=lc_demo");
  fetchMock.mockReturnValue(signedIn());
  render(<CallbackPage lang="en" />);
  await waitFor(() => expect(replace).toHaveBeenCalled());
  expect(localStorage.getItem(SESSION_KEY)).not.toContain("ada-obi");
});

test("in Strict Mode the one-time code is sent once", async () => {
  open("?login_code=lc_demo");
  fetchMock.mockImplementation(signedIn);
  render(
    <StrictMode>
      <CallbackPage lang="en" />
    </StrictMode>,
  );
  await waitFor(() => expect(replace).toHaveBeenCalled());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledTimes(1);
});

function expectAlert(title: string) {
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toContain(title);
  expect(document.activeElement).toBe(alert);
  return alert;
}

test("a link with no code explains that, and offers a way back to sign-in", async () => {
  open("", null);
  render(<CallbackPage lang="en" />);
  await waitFor(() => expectAlert("This sign-in link is incomplete"));
  expect(screen.getByRole("link", { name: "Back to sign-in" }).getAttribute("href")).toBe("/en/sign-in");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a code with no saved verifier says sign-in must start again in the same browser", async () => {
  open("?login_code=lc_demo", null);
  render(<CallbackPage lang="en" />);
  await waitFor(() => expectAlert("We lost track of this sign-in"));
  expect(screen.getByRole("alert").textContent).toContain("same browser");
  expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/en/sign-in");
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a refused code says it expired or was already used, and keeps the session empty", async () => {
  open("?login_code=lc_old");
  fetchMock.mockReturnValue(refused());
  render(<CallbackPage lang="en" />);
  await waitFor(() => expectAlert("That sign-in link expired"));
  expect(screen.getByRole("alert").textContent).toContain("already used");
  expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/en/sign-in");
  expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBe("verifier-demo");
  expect(replace).not.toHaveBeenCalled();
});

test("any other failure is a generic message with a way to start again", async () => {
  open("?login_code=lc_demo");
  fetchMock.mockReturnValue(reply(500, { detail: "boom" }));
  render(<CallbackPage lang="en" />);
  await waitFor(() => expectAlert("Sign-in didn't finish"));
  expect(screen.getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe("/en/sign-in");
  expect(replace).not.toHaveBeenCalled();
});

test("a success reply with no token is treated as a failure", async () => {
  open("?login_code=lc_demo");
  fetchMock.mockReturnValue(reply(200, { data: {} }));
  render(<CallbackPage lang="en" />);
  await waitFor(() => expectAlert("Sign-in didn't finish"));
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("when the session cannot be saved, the person is told and sent nowhere", async () => {
  open("?login_code=lc_demo");
  fetchMock.mockReturnValue(signedIn());
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  render(<CallbackPage lang="en" />);
  await waitFor(() => expectAlert("Sign-in didn't finish"));
  expect(replace).not.toHaveBeenCalled();
});

test("when the network fails, Try again sends the code once more and can succeed", async () => {
  open("?login_code=lc_demo");
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockImplementationOnce(signedIn);
  render(<CallbackPage lang="en" />);

  await waitFor(() => expectAlert("We couldn't reach Village Sqwhere"));
  expect(screen.getByRole("link", { name: "Back to sign-in" }).getAttribute("href")).toBe("/en/sign-in");
  expect(sessionStorage.getItem(PKCE_VERIFIER_KEY)).toBe("verifier-demo");

  fireEvent.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/en/onboarding"));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).login_code).toBe("lc_demo");
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
});

test("the French page shows French text and French links", async () => {
  open("?login_code=lc_old");
  fetchMock.mockReturnValue(refused());
  render(<CallbackPage lang="fr" />);
  await waitFor(() => expectAlert("Ce lien de connexion a expiré"));
  expect(screen.getByRole("link", { name: "Se reconnecter" }).getAttribute("href")).toBe("/fr/sign-in");
});

test("the French page says it is finishing the connection", () => {
  open("?login_code=lc_demo");
  fetchMock.mockReturnValue(new Promise(() => {}));
  render(<CallbackPage lang="fr" />);
  expect(screen.getByRole("heading", { level: 1, name: "Finalisation de la connexion" })).toBeTruthy();
});

test("the top bar links home in the page's language and has no language switch", () => {
  open("", null);
  render(<CallbackPage lang="fr" />);
  expect(screen.getByRole("link", { name: /Village Sqwhere/ }).getAttribute("href")).toBe("/fr");
  expect(screen.queryByRole("link", { name: /English|français/i })).toBeNull();
});
