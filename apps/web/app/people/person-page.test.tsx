import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { api, asked, fetchMock, reply } from "../hubs/test-support";
import { forgetMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { PersonPage } from "./person-page";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

// a made-up developer, as the API answers their profile
const person = (over: Record<string, unknown> = {}) => ({
  id: "id-ama",
  username: "ama-mensah",
  display_name: "Ama Mensah",
  avatar_url: null,
  bio: "I build offline-first apps.\nMostly for clinics.",
  country_code: "GH",
  is_verified: true,
  verified_roles: [{ slug: "mobile-engineer", name: "Mobile Engineer" }],
  technologies: [{ slug: "flutter", name: "Flutter" }],
  sectors: [{ slug: "health", name: "Health" }],
  ...over,
});

const me = (username = "kwabena-owusu") => ({ username, display_name: "Kwabena Owusu", roles: [], technologies: [], sectors: [] });

function open(username: string | null, answer: unknown, lang: "en" | "fr" = "en", viewer = me()) {
  nav.search = username === null ? "" : `username=${encodeURIComponent(username)}`;
  api({ "GET /v1/me": { data: viewer }, ...(username !== null && { [`GET /v1/users/${encodeURIComponent(username)}`]: answer }) });
  render(<PersonPage lang={lang} />);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
  forgetMe();
});

test("shows another developer's public profile", async () => {
  open("ama-mensah", { data: person() });
  expect(screen.getByText("Loading the profile")).toBeTruthy();
  expect(await screen.findByRole("heading", { level: 1, name: "Ama Mensah" })).toBeTruthy();
  expect(screen.getByText("@ama-mensah")).toBeTruthy();
  expect(screen.getByText("Verified")).toBeTruthy();
  expect(screen.getByText("Country: Ghana")).toBeTruthy();
  expect(screen.getByText(/I build offline-first apps\./).textContent).toBe("I build offline-first apps.\nMostly for clinics.");
  expect(screen.getByRole("list", { name: "Verified roles" }).textContent).toBe("Mobile Engineer");
  expect(screen.getByRole("list", { name: "Stack" }).textContent).toBe("Flutter");
  expect(screen.getByRole("list", { name: "Sectors" }).textContent).toBe("Health");
  const github = screen.getByRole("link", { name: "See them on GitHub (opens in a new tab)" });
  expect(github.getAttribute("href")).toBe("https://github.com/ama-mensah");
  expect(screen.queryByRole("link", { name: "Edit your profile" })).toBeNull();
  expect(asked()).toContain("GET /v1/users/ama-mensah");
});

test("the demo's people have no GitHub button, since their username is not on GitHub", async () => {
  open("ama-mensah", { data: person() }, "en", { ...me(), is_demo: true } as ReturnType<typeof me>);
  expect(await screen.findByRole("heading", { level: 1, name: "Ama Mensah" })).toBeTruthy();
  await waitFor(() => expect(asked()).toContain("GET /v1/me"));
  expect(screen.queryByRole("link", { name: /GitHub/ })).toBeNull();
  expect(screen.getByText("@ama-mensah")).toBeTruthy();
});

test("a profile with little in it says so, and a GitHub name is shown once", async () => {
  open("danladi", {
    data: person({ username: "danladi", display_name: "danladi", bio: null, country_code: null, is_verified: false, verified_roles: [], technologies: [], sectors: [] }),
  });
  expect(await screen.findByRole("heading", { level: 1, name: "@danladi" })).toBeTruthy();
  expect(screen.getByText("No role verified yet.")).toBeTruthy();
  expect(screen.queryByText("Verified")).toBeNull();
  expect(screen.queryByText(/Country/)).toBeNull();
  expect(screen.queryByRole("heading", { name: "Stack" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Sectors" })).toBeNull();
});

test("your own profile offers to edit it", async () => {
  open("Ama-Mensah", { data: person() }, "en", me("ama-mensah"));
  expect(await screen.findByRole("link", { name: "Edit your profile" })).toBeTruthy();
  expect(screen.getByText("This is how other developers see you.")).toBeTruthy();
});

test("an unknown or deleted developer, or no username, says the developer can't be found", async () => {
  open("nobody-here", reply(404, { detail: { code: "USER_NOT_FOUND", message: "No developer has this username." } }));
  expect(await screen.findByRole("heading", { level: 1, name: "We can't find this developer" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to the village" }).getAttribute("href")).toBe("/en/village");
  cleanup();
  fetchMock.mockClear();
  open(null, null);
  expect(await screen.findByRole("heading", { level: 1, name: "We can't find this developer" })).toBeTruthy();
  expect(asked().some((line) => line.startsWith("GET /v1/users/"))).toBe(false);
});

test("a username with odd characters is sent encoded", async () => {
  open("a/b", { data: person({ username: "a/b", display_name: "a/b" }) });
  await screen.findByRole("heading", { level: 1 });
  expect(asked()).toContain("GET /v1/users/a%2Fb");
});

test("a profile that cannot load is handed to the page's error screen", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? <p>error screen</p> : this.props.children;
    }
  }
  nav.search = "username=ama-mensah";
  api({ "GET /v1/me": { data: me() }, "GET /v1/users/ama-mensah": reply(500) });
  render(
    <Boundary>
      <PersonPage lang="en" />
    </Boundary>,
  );
  expect(await screen.findByText("error screen")).toBeTruthy();
});

test("the profile speaks French", async () => {
  open("ama-mensah", { data: person() }, "fr");
  expect(await screen.findByRole("heading", { level: 2, name: "Rôles vérifiés" })).toBeTruthy();
  expect(screen.getByText(/^Pays/).textContent).toBe("Pays : Ghana");
  expect(screen.getByRole("link", { name: "Voir son profil GitHub (s'ouvre dans un nouvel onglet)" })).toBeTruthy();
});
