import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY, saveSession } from "./session";
import { AccountNavLink, RequireSession } from "./session-ui";

const replace = vi.fn();

const signIn = () =>
  act(() => {
    saveSession({ access_token: "a", refresh_token: "rt_demo", expires_in: 900, refresh_expires_at: "2099-01-01T00:00:00Z" });
  });

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("location", { replace });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replace.mockReset();
});

const nav = <AccountNavLink lang="fr" signIn="Connexion" signOut="Déconnexion" className="link" />;

test("a visitor gets the sign-in link", () => {
  render(nav);
  expect(screen.getByRole("link", { name: "Connexion" }).getAttribute("href")).toBe("/fr/sign-in");
});

test("once signed in, the link becomes a sign-out button that signs out and goes home", async () => {
  render(nav);
  signIn();
  fireEvent.click(screen.getByRole("button", { name: "Déconnexion" }));
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith("/fr"));
});

test("a signed-in person sees the page", () => {
  signIn();
  render(
    <RequireSession lang="en" fallback={<p>Loading</p>}>
      <p>Inside</p>
    </RequireSession>,
  );
  expect(screen.getByText("Inside")).toBeTruthy();
  expect(replace).not.toHaveBeenCalled();
});

test("anyone else is sent to sign-in in their language", () => {
  render(
    <RequireSession lang="fr" fallback={<p>Loading</p>}>
      <p>Inside</p>
    </RequireSession>,
  );
  expect(screen.queryByText("Inside")).toBeNull();
  expect(screen.getByText("Loading")).toBeTruthy();
  expect(replace).toHaveBeenCalledWith("/fr/sign-in");
});
