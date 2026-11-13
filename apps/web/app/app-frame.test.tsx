import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AppFrame } from "./app-frame";
import type { Hub } from "./hubs/hubs-api";
import { forgetInvitation, keepInvitations } from "./hubs/invitations";
import { loadMe, useMe } from "./session/me";
import { SESSION_KEY } from "./session/session";

const fetchMock = vi.fn();
const answer = (roles: unknown[] = [], display_name = "Aminata Ndiaye") =>
  new Response(JSON.stringify({ data: { username: "aminata-n", display_name, roles, technologies: [] } }), { status: 200 });
const verified = { slug: "backend-engineer", name: "Backend", is_primary: true, verified_at: "2026-11-06T18:00:00Z" };

function signIn() {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
}

const places = () => within(screen.getByRole("navigation", { name: /^(Main|Principale)$/ }));
const names = () => places().getAllByRole("link").map((link) => link.textContent);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

test("a signed-in developer can reach every place, and sees which one they are in", () => {
  signIn();
  render(<AppFrame lang="fr" path="ideas/compose?id=1">screen</AppFrame>);
  expect(names()).toEqual(["Village", "Idées", "Espaces", "Profil"]);
  expect(places().getByRole("link", { name: "Idées" }).getAttribute("href")).toBe("/fr/ideas");
  expect(places().getByRole("link", { name: "Idées" }).getAttribute("aria-current")).toBe("page");
  expect(places().getByRole("link", { name: "Village" }).getAttribute("aria-current")).toBeNull();
});

test("peer reviews appear once the developer holds a Green Tick", async () => {
  signIn();
  fetchMock.mockResolvedValue(answer([verified]));
  render(<AppFrame lang="en" path="village">screen</AppFrame>);
  expect(names()).not.toContain("Reviews");
  await loadMe();
  await waitFor(() => expect(names()).toEqual(["Village", "Ideas", "Hubs", "Reviews", "Profile"]));
});

test("Hubs is marked while an invitation waits, and the mark goes when it is answered", () => {
  signIn();
  render(<AppFrame lang="en" path="village">screen</AppFrame>);
  expect(places().getByRole("link", { name: "Hubs" })).toBeTruthy();

  act(() => keepInvitations([{ id: "hub-1" } as Hub]));
  expect(places().getByRole("link", { name: /^Hubs\s*, an invitation is waiting$/ }).getAttribute("href")).toBe("/en/hubs");

  // signed or declined
  act(() => forgetInvitation("hub-1"));
  expect(places().getByRole("link", { name: "Hubs" })).toBeTruthy();
});

test("a screen that is in none of the places marks none", () => {
  signIn();
  render(<AppFrame lang="en" path="verification">screen</AppFrame>);
  expect(places().getAllByRole("link").every((link) => !link.hasAttribute("aria-current"))).toBe(true);
});

test("the language link opens the same screen in the other language", () => {
  signIn();
  render(<AppFrame lang="en" path="hubs/view?id=7">screen</AppFrame>);
  const link = screen.getByRole("link", { name: "Français" });
  expect(link.getAttribute("href")).toBe("/fr/hubs/view?id=7");
  expect(link.getAttribute("translate")).toBe("no");
});

test("the theme switch says what a press does, and does it", () => {
  signIn();
  render(<AppFrame lang="en" path="village">screen</AppFrame>);
  fireEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  expect(localStorage.getItem("vs-theme")).toBe("dark");
  fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
  expect(document.documentElement.getAttribute("data-theme")).toBe("light");
});

test("onboarding gets the header only, with sign out, because there is nowhere to go yet", () => {
  signIn();
  render(<AppFrame lang="en" path="onboarding" bare>screen</AppFrame>);
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
});

test("elsewhere, signing out is on the profile page, not in the header", () => {
  signIn();
  render(<AppFrame lang="en" path="village">screen</AppFrame>);
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
});

test("a locked screen offers no way out at all", () => {
  signIn();
  render(<AppFrame lang="en" path="verification" locked>screen</AppFrame>);
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Village Sqwhere")).toBeTruthy();
});

test("a visitor who is not signed in sees no places, and the logo leads to the landing page", () => {
  render(<AppFrame lang="en" path="village">screen</AppFrame>);
  expect(screen.queryByRole("navigation")).toBeNull();
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe("/en");
});

// ---------- the profile, kept between screens ----------

function Name() {
  const me = useMe();
  return <p>{me ? me.display_name : "Loading"}</p>;
}

test("the second screen of a visit shows the profile at once, then the fresh one", async () => {
  signIn();
  fetchMock.mockResolvedValueOnce(answer());
  const first = render(<Name />);
  expect(screen.getByText("Loading")).toBeTruthy();
  expect(await screen.findByText("Aminata Ndiaye")).toBeTruthy();
  first.unmount();

  fetchMock.mockResolvedValueOnce(answer([], "Aminata N."));
  render(<Name />);
  // no loading screen this time
  expect(screen.getByText("Aminata Ndiaye")).toBeTruthy();
  expect(await screen.findByText("Aminata N.")).toBeTruthy();
});

test("with a profile on screen, a failed refresh changes nothing", async () => {
  signIn();
  fetchMock.mockResolvedValueOnce(answer());
  const first = render(<Name />);
  await screen.findByText("Aminata Ndiaye");
  first.unmount();

  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  render(<Name />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Aminata Ndiaye")).toBeTruthy();
});
