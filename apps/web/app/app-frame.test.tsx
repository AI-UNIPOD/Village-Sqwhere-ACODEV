import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AppFrame } from "./app-frame";
import type { Hub } from "./hubs/hubs-api";
import { forgetInvitation, keepInvitations } from "./hubs/invitations";
import { noticeDemoRefusal, resetDemo } from "./session/demo";
import { forgetMe, useMe } from "./session/me";
import { SESSION_KEY } from "./session/session";
import { endTour } from "./tour/tour";

// the demo line's "Take the tour" and the tour panel go to a screen with the router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

// a screen that asks for the profile
function Name() {
  const me = useMe();
  return <p>{me ? me.display_name : "Loading"}</p>;
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
  resetDemo();
  endTour();
  // the frame asks for the profile itself (ensureMe), so each test starts without the last one's
  forgetMe();
});

test("a signed-in developer can reach every place, and sees which one they are in", () => {
  signIn();
  render(<AppFrame lang="fr" path="ideas/compose?id=1">screen</AppFrame>);
  expect(names()).toEqual(["Village", "Fil", "Idées", "Espaces", "Profil"]);
  expect(places().getByRole("link", { name: "Idées" }).getAttribute("href")).toBe("/fr/ideas");
  expect(places().getByRole("link", { name: "Idées" }).getAttribute("aria-current")).toBe("page");
  expect(places().getByRole("link", { name: "Village" }).getAttribute("aria-current")).toBeNull();
});

test("peer reviews appear once the developer holds a Green Tick, on a screen that never asks who they are", async () => {
  signIn();
  fetchMock.mockResolvedValue(answer([verified]));
  render(<AppFrame lang="en" path="hubs">screen</AppFrame>);
  expect(names()).not.toContain("Reviews");
  // the frame asks for the profile itself
  await waitFor(() => expect(names()).toEqual(["Village", "Feed", "Ideas", "Hubs", "Reviews", "Profile"]));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/v1\/me$/);
});

test("the frame and the screen inside it share one request for the profile", async () => {
  signIn();
  fetchMock.mockImplementation(async () => answer());
  render(
    <AppFrame lang="en" path="village">
      <Name />
    </AppFrame>,
  );
  expect(await screen.findByText("Aminata Ndiaye")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("a visitor who is not signed in is not asked about", () => {
  render(<AppFrame lang="en" path="village">screen</AppFrame>);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("when the profile cannot be loaded, the frame only shows less", async () => {
  signIn();
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<AppFrame lang="en" path="hubs">screen</AppFrame>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(names()).toEqual(["Village", "Feed", "Ideas", "Hubs", "Profile"]);
  expect(screen.getByText("screen")).toBeTruthy();
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

test("a post is read in the feed, so the feed is the place marked", () => {
  signIn();
  render(<AppFrame lang="en" path="posts/view?id=1">screen</AppFrame>);
  expect(places().getByRole("link", { name: "Feed" }).getAttribute("aria-current")).toBe("page");
  expect(places().getAllByRole("link").filter((link) => link.hasAttribute("aria-current")).length).toBe(1);
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

// ---------- the demo account ----------

const demoAnswer = () =>
  new Response(JSON.stringify({ data: { username: "demo", display_name: "Demo Developer", is_demo: true, roles: [], technologies: [] } }), { status: 200 });
const refused = () => new Response(JSON.stringify({ detail: { code: "DEMO_READ_ONLY", message: "English" } }), { status: 403 });

test("the demo account sees, on every screen, that nothing is saved and the way out", async () => {
  signIn();
  fetchMock.mockResolvedValue(demoAnswer());
  render(<AppFrame lang="en" path="hubs">screen</AppFrame>);
  expect(screen.queryByText(/You are in the demo/)).toBeNull();
  // Your hubs never asks for the profile: the frame does
  await screen.findByText(/You are in the demo/);
  expect(screen.getByRole("status").textContent).toBe("You are in the demo. Look at everything: nothing you change is saved.");
  expect(screen.getByRole("button", { name: "Leave the demo" })).toBeTruthy();
});

test("when the API refuses a change, the demo line says it was not saved, each time", async () => {
  signIn();
  fetchMock.mockResolvedValue(demoAnswer());
  render(<AppFrame lang="fr" path="feed">screen</AppFrame>);
  const first = await screen.findByRole("status");
  expect(first.textContent).toMatch(/^Vous êtes dans la démo/);

  await act(() => noticeDemoRefusal(refused()));
  const said = screen.getByRole("status");
  expect(said.textContent).toMatch(/^Cela n'a pas été enregistré/);
  // a second refusal is a new line, so it is announced again
  await act(() => noticeDemoRefusal(refused()));
  expect(screen.getByRole("status")).not.toBe(said);
  expect(screen.getByRole("status").textContent).toMatch(/^Cela n'a pas été enregistré/);
});

test("other refusals, and other accounts, get no demo line", async () => {
  signIn();
  fetchMock.mockResolvedValue(answer());
  render(<AppFrame lang="en" path="village">screen</AppFrame>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await act(async () => {});
  await act(() => noticeDemoRefusal(new Response(JSON.stringify({ detail: { code: "NOT_POST_AUTHOR" } }), { status: 403 })));
  await act(() => noticeDemoRefusal(refused()));
  expect(screen.queryByText(/demo/i)).toBeNull();
});

// ---------- the profile, kept between screens ----------

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
