import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { AppFrame } from "./app-frame";
import { initials } from "./initials";
import { ProfileMenu } from "./profile-menu";
import { forgetMe } from "./session/me";
import { SESSION_KEY, signOut } from "./session/session";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./session/session", async (original) => ({ ...(await original<typeof import("./session/session")>()), signOut: vi.fn() }));

const fetchMock = vi.fn();
const me = (display_name: string, username: string, is_demo = false) =>
  new Response(JSON.stringify({ data: { username, display_name, is_demo, roles: [], technologies: [] } }), { status: 200 });

function signIn() {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
}

beforeEach(() => {
  forgetMe();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  vi.mocked(signOut).mockClear();
  localStorage.clear();
});

const button = () => screen.getByRole("button", { name: /^(Account menu|Menu du compte)/ });
const open = () => fireEvent.click(button());

// ---------- the letters ----------

test.each([
  ["Aminata Ndiaye", "aminata-n", "AN"],
  ["Ọláolúwa Adébáyò", "olaoluwa", "ỌA"],
  ["Kofi", "kofi-ships", "K"],
  ["Ada Lovelace King", "ada", "AK"],
  ["  mary   jane  ", "mj", "MJ"],
  ["", "kofi_ships", "KS"],
  ["Élodie Çelik", "e", "ÉÇ"],
  ["   ", "", "•"],
  ["\u{1F600} Smile", "x", "\u{1F600}S"],
])("%j with the username %j reads %j", (name, username, letters) => {
  expect(initials(name, username)).toBe(letters);
});

test("a very long name gives two letters, not a word: the first and last words count", () => {
  expect(initials("Wolfeschlegelsteinhausenbergerdorff Wolfeschlegelsteinhausenbergerdorff-Smith")).toBe("WS");
});

// ---------- the menu ----------

test("the avatar shows the initials and is named by the menu and the person", () => {
  render(<ProfileMenu lang="en" name="Aminata Ndiaye" username="aminata-n" leave="Sign out" />);
  expect(button().getAttribute("aria-label")).toBe("Account menu: Aminata Ndiaye");
  expect(button().textContent).toBe("AN");
  expect(button().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("menu")).toBeNull();
});

test("opening shows who is signed in, the profile and the way out, with focus on the first item", () => {
  render(<ProfileMenu lang="en" name="Aminata Ndiaye" username="aminata-n" leave="Sign out" />);
  open();
  expect(button().getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Aminata Ndiaye")).toBeTruthy();
  expect(screen.getByText("@aminata-n")).toBeTruthy();
  const menu = within(screen.getByRole("menu", { name: "Account menu" }));
  const profile = menu.getByRole("menuitem", { name: "Profile and settings" });
  expect(profile.getAttribute("href")).toBe("/en/profile");
  expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeTruthy();
  expect(document.activeElement).toBe(profile);
});

test("the arrow keys, Home and End move between the items, and wrap", () => {
  render(<ProfileMenu lang="en" name="Aminata Ndiaye" username="aminata-n" leave="Sign out" />);
  open();
  const [profile, out] = screen.getAllByRole("menuitem");
  fireEvent.keyDown(profile, { key: "ArrowDown" });
  expect(document.activeElement).toBe(out);
  fireEvent.keyDown(out, { key: "ArrowDown" });
  expect(document.activeElement).toBe(profile);
  fireEvent.keyDown(profile, { key: "ArrowUp" });
  expect(document.activeElement).toBe(out);
  fireEvent.keyDown(out, { key: "Home" });
  expect(document.activeElement).toBe(profile);
  fireEvent.keyDown(profile, { key: "End" });
  expect(document.activeElement).toBe(out);
});

test("Escape closes the menu and gives focus back to the avatar", () => {
  render(<ProfileMenu lang="en" name="Aminata Ndiaye" username="aminata-n" leave="Sign out" />);
  open();
  fireEvent.keyDown(screen.getAllByRole("menuitem")[0], { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(button());
});

test("Tab out of the menu closes it, and the avatar toggles it", () => {
  render(<ProfileMenu lang="en" name="Aminata Ndiaye" username="aminata-n" leave="Sign out" />);
  open();
  fireEvent.keyDown(screen.getAllByRole("menuitem")[1], { key: "Tab" });
  expect(screen.queryByRole("menu")).toBeNull();
  open();
  expect(screen.getByRole("menu")).toBeTruthy();
  open();
  expect(screen.queryByRole("menu")).toBeNull();
});

test("a press outside closes it, a press inside does not", () => {
  render(
    <div>
      <p>Elsewhere</p>
      <ProfileMenu lang="en" name="Aminata Ndiaye" username="aminata-n" leave="Sign out" />
    </div>,
  );
  open();
  fireEvent.pointerDown(screen.getByText("Aminata Ndiaye"));
  expect(screen.getByRole("menu")).toBeTruthy();
  fireEvent.pointerDown(screen.getByText("Elsewhere"));
  expect(screen.queryByRole("menu")).toBeNull();
});

test("choosing the profile closes the menu, and signing out signs out once", () => {
  render(<ProfileMenu lang="fr" name="Aminata Ndiaye" username="aminata-n" leave="Déconnexion" />);
  open();
  expect(button().getAttribute("aria-label")).toBe("Menu du compte: Aminata Ndiaye");
  fireEvent.click(screen.getByRole("menuitem", { name: "Profil et réglages" }));
  expect(screen.queryByRole("menu")).toBeNull();

  open();
  const out = screen.getByRole("menuitem", { name: "Déconnexion" });
  fireEvent.click(out);
  fireEvent.click(out);
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledWith("fr");
});

// ---------- in the frame ----------

test("every signed-in screen has the avatar once the profile is known, in the header's tools", async () => {
  signIn();
  fetchMock.mockResolvedValue(me("Aminata Ndiaye", "aminata-n"));
  render(<AppFrame lang="en" path="feed"><p>Screen</p></AppFrame>);
  const avatar = await screen.findByRole("button", { name: "Account menu: Aminata Ndiaye" });
  expect(within(screen.getByRole("banner")).getByRole("button", { name: /Account menu/ })).toBe(avatar);
  expect(avatar.textContent).toBe("AN");
});

test("a visitor, and a developer who has no profile yet, see no avatar", async () => {
  render(<AppFrame lang="en" path="feed"><p>Screen</p></AppFrame>);
  expect(screen.queryByRole("button", { name: /Account menu/ })).toBeNull();
  cleanup();

  signIn();
  fetchMock.mockResolvedValue(me("Aminata Ndiaye", "aminata-n"));
  render(<AppFrame lang="en" path="onboarding" bare><p>Screen</p></AppFrame>);
  await act(async () => {});
  expect(screen.queryByRole("button", { name: /Account menu/ })).toBeNull();
  // the bare header keeps its plain way out
  expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
});

test("a locked screen offers no avatar, because it offers no way out", async () => {
  signIn();
  fetchMock.mockResolvedValue(me("Aminata Ndiaye", "aminata-n"));
  render(<AppFrame lang="en" path="verification/interview" locked><p>Screen</p></AppFrame>);
  await act(async () => {});
  expect(screen.queryByRole("button", { name: /Account menu/ })).toBeNull();
});

test("the demo account's way out is called Leave the demo", async () => {
  signIn();
  fetchMock.mockResolvedValue(me("Aminata Ndiaye", "aminata-n", true));
  render(<AppFrame lang="en" path="feed"><p>Screen</p></AppFrame>);
  fireEvent.click(await screen.findByRole("button", { name: /Account menu/ }));
  expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Leave the demo" })).toBeTruthy();
  // and the demo line under the header still has its own link out
  await waitFor(() => expect(screen.getByRole("button", { name: "Leave the demo" })).toBeTruthy());
});

test("a long name wraps inside the menu and keeps the whole name for screen readers", () => {
  const long = "Wolfeschlegelsteinhausenbergerdorff-Wolfeschlegelsteinhausenbergerdorff Anastasia";
  render(<ProfileMenu lang="en" name={long} username="a-very-long-username-that-keeps-going-and-going" leave="Sign out" />);
  expect(button().getAttribute("aria-label")).toBe(`Account menu: ${long}`);
  open();
  expect(screen.getByText(long)).toBeTruthy();
});
