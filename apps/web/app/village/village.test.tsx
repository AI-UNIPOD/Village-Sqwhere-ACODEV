import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import VillageError from "../[lang]/village/error";
import landing from "../landing/landing-page.module.css";
import { keepInvitations } from "../hubs/invitations";
import { SESSION_KEY } from "../session/session";
import { copy } from "./copy";
import { READS_WAIT_MS, Village } from "./village";

const route = vi.hoisted(() => ({ lang: "en" }));
// useRouter is for the demo bar, which the frame draws for the demo account
vi.mock("next/navigation", () => ({ useParams: () => ({ lang: route.lang }), useRouter: () => ({ push: vi.fn() }) }));

const fetchMock = vi.fn();

const role = (slug: string, name: string, verified = false) => ({
  slug,
  name,
  is_primary: true,
  verified_at: verified ? "2026-11-06T18:00:00Z" : null,
});

// What the API answers for a made-up developer: the profile, the invitations, the hubs and the
// ideas, one idea to a page so that reading on can be tried. A list set to null fails.
type World = { invitations?: unknown[] | null; hubs?: unknown[] | null; ideas?: { status: string }[] | null };

function signedInAs(me: { roles?: unknown[]; technologies?: unknown[]; display_name?: string; is_demo?: boolean }, world: World = {}) {
  const { invitations = [], hubs = [], ideas = [] } = world;
  const answer = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  const failure = () => Promise.resolve(new Response("{}", { status: 500 }));
  fetchMock.mockImplementation((url: string) => {
    const address = String(url);
    if (address.includes("/v1/me/ideas")) {
      if (!ideas) return failure();
      const offset = Number(new URL(address, "http://api").searchParams.get("offset"));
      return answer({ data: ideas.slice(offset, offset + 1), next_offset: offset + 1 < ideas.length ? offset + 1 : null });
    }
    const list = address.includes("status=invited") ? invitations : address.includes("/v1/me/hubs") ? hubs : undefined;
    if (list === null) return failure();
    return answer({
      data: list ?? { username: "aminata-n", display_name: "Aminata Ndiaye", roles: [], technologies: [], ...me },
      next_offset: null,
    });
  });
}

// the step with this title, as a list item, once the steps have loaded
const step = async (title: string) => (await screen.findByRole("heading", { level: 3, name: title })).closest("li")!;

// which of the two kinds of button a link is: the screen's one main button, or a quiet one
const isMain = (link: HTMLElement) => link.className.includes(landing.btn);

const IDEA = "Share an idea, or join one";
const HUB = "Build together in a hub";
const verifiedBackend = () => [role("backend-engineer", "Backend & Systems Engineer", true)];

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  keepInvitations(null);
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

test("while the profile loads, the page says so and shows no empty profile", async () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  render(<Village lang="en" />);
  expect(screen.getByRole("status").textContent).toBe("Opening your village");
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});

test("a new member is greeted by name and sent to set up their profile first", async () => {
  signedInAs({});
  render(<Village lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "Good to see you, Aminata." })).toBeTruthy();
  expect(screen.getByText("No role chosen yet")).toBeTruthy();

  const profile = await step("Set up your profile");
  expect(within(profile).getByText("Next")).toBeTruthy();
  expect(within(profile).getByRole("link", { name: "Set up my profile" }).getAttribute("href")).toBe(
    "/en/onboarding?step=role",
  );
  for (const title of ["Earn your Green Tick", IDEA, HUB]) {
    expect(within(await step(title)).getByText("Later")).toBeTruthy();
  }
});

test("an invitation to a hub is the next thing to do, ahead of verifying", async () => {
  signedInAs({ roles: [role("backend-engineer", "Backend & Systems Engineer")] }, { invitations: [{ id: "hub-1" }] });
  render(<Village lang="en" />);
  const hub = within(await step(HUB));
  const invitation = await hub.findByRole("link", { name: "See your invitation" });
  expect(invitation.getAttribute("href")).toBe("/en/hubs");
  expect(hub.getByText("Next")).toBeTruthy();
  // the one main button moved here: verifying can still start, as an open step
  const verify = within(await step("Earn your Green Tick")).getByRole("link", { name: "Start verification" });
  expect(isMain(invitation)).toBe(true);
  expect(isMain(verify)).toBe(false);
  expect(within(await step("Earn your Green Tick")).getByText("Open")).toBeTruthy();
  expect(hub.queryByRole("link", { name: "Your hubs" })).toBeNull();
});

test("several invitations are counted, in French too", async () => {
  signedInAs({ roles: [] }, { invitations: [{ id: "hub-1" }, { id: "hub-2" }] });
  render(<Village lang="fr" />);
  const link = await screen.findByRole("link", { name: "Voir vos 2 invitations" });
  expect(link.getAttribute("href")).toBe("/fr/hubs");
});

test("with no invitation, or when they cannot be loaded, the hub step waits as before", async () => {
  for (const invitations of [[], null]) {
    signedInAs({ roles: [role("backend-engineer", "Backend")] }, { invitations });
    const { unmount } = render(<Village lang="en" />);
    const hub = within(await step(HUB));
    expect(hub.getByText("Later")).toBeTruthy();
    expect(hub.getByRole("link", { name: "Your hubs" })).toBeTruthy();
    unmount();
  }
});

test("with a role chosen, the profile step is done and verifying the role is next", async () => {
  signedInAs({
    roles: [role("backend-engineer", "Backend & Systems Engineer")],
    technologies: [{ slug: "go", name: "Go" }, { slug: "vector-databases", name: "Vector Databases" }],
  });
  render(<Village lang="fr" />);
  expect(await screen.findByRole("heading", { level: 1, name: "Ravis de vous voir, Aminata." })).toBeTruthy();
  // the role and the stack are shown in French, by slug
  expect(screen.getByText("Ingénieur backend et systèmes")).toBeTruthy();
  expect(screen.getByText("Pas encore vérifié")).toBeTruthy();
  expect(screen.getByText("Bases de données vectorielles")).toBeTruthy();

  const profile = await step("Configurer votre profil");
  expect(within(profile).getByText("Fait")).toBeTruthy();
  expect(within(profile).getByRole("link", { name: "Modifier mon profil" }).getAttribute("href")).toBe("/fr/profile");
  const verify = await step("Obtenir votre Green Tick");
  expect(within(verify).getByText("À faire")).toBeTruthy();
  expect(within(verify).getByRole("link", { name: "Commencer la vérification" }).getAttribute("href")).toBe("/fr/verification");
  // sharing an idea does not wait for the Green Tick
  const idea = await step("Partager une idée, ou en rejoindre une");
  expect(within(idea).getByText("Ouverte")).toBeTruthy();
  expect(within(idea).getByRole("link", { name: "Partager une idée" }).getAttribute("href")).toBe("/fr/ideas/mine");
  expect(within(idea).getByRole("link", { name: "Parcourir les idées ouvertes" }).getAttribute("href")).toBe("/fr/ideas");
  expect(screen.getByRole("link", { name: "Vos espaces" }).getAttribute("href")).toBe("/fr/hubs");
});

test("with an attempt under way, the step leads back to where it stands", async () => {
  const attempt = { attempts_used: 1, attempts_remaining: 2, latest_status: "awaiting_review" };
  signedInAs({ roles: [{ ...role("backend-engineer", "Backend & Systems Engineer"), verification: attempt }] });
  render(<Village lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  expect(within(await step("Earn your Green Tick")).getByRole("link", { name: "See where it stands" }).getAttribute("href")).toBe("/en/verification");
});

test("a verified role shows as verified, and its step is done", async () => {
  signedInAs({ roles: [role("backend-engineer", "Backend & Systems Engineer", true)] });
  render(<Village lang="en" />);
  expect(await screen.findByText("Verified")).toBeTruthy();
  expect(within(await step("Earn your Green Tick")).getByText("Done")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Start verification" })).toBeNull();
  expect(screen.getByRole("link", { name: "Review attempts in your role" }).getAttribute("href")).toBe("/en/reviews");
  // with the Green Tick earned, sharing an idea is the step to do now
  expect(within(await step("Share an idea, or join one")).getByText("Next")).toBeTruthy();
});

// the idea step and the hub step, once the steps have loaded
async function ideaAndHub() {
  return { idea: within(await step(IDEA)), hub: within(await step(HUB)) };
}

test("while their ideas and hubs load, the steps wait as a skeleton and none shows as Next", async () => {
  const hubs = Promise.withResolvers<Response>();
  signedInAs({ roles: verifiedBackend() }, { ideas: [{ status: "open" }] });
  const answer = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string) => (String(url).includes("/v1/me/hubs?offset") ? hubs.promise : answer(url)));
  render(<Village lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  expect(await screen.findByText("Checking where you are")).toBeTruthy();
  expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  expect(screen.queryByText("Next")).toBeNull();
  hubs.resolve(new Response(JSON.stringify({ data: [{ status: "active" }], next_offset: null }), { status: 200 }));
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Done")).toBeTruthy();
  expect(hub.getByText("Done")).toBeTruthy();
  expect(screen.queryByText("Checking where you are")).toBeNull();
});

test("with no ideas and no hubs, sharing an idea is next and the hub step waits", async () => {
  signedInAs({ roles: verifiedBackend() });
  render(<Village lang="en" />);
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Next")).toBeTruthy();
  expect(isMain(idea.getByRole("link", { name: "Share an idea" }))).toBe(true);
  expect(hub.getByText("Later")).toBeTruthy();
  expect(isMain(hub.getByRole("link", { name: "Your hubs" }))).toBe(false);
});

test("a draft is not a shared idea", async () => {
  signedInAs({ roles: verifiedBackend() }, { ideas: [{ status: "draft" }, { status: "draft" }] });
  render(<Village lang="en" />);
  const { idea } = await ideaAndHub();
  expect(idea.getByText("Next")).toBeTruthy();
  expect(idea.queryByRole("link", { name: "Your ideas" })).toBeNull();
});

test("an idea that is open, or closed, past the drafts, finishes the idea step", async () => {
  for (const status of ["open", "closed"]) {
    signedInAs({ roles: verifiedBackend() }, { ideas: [{ status: "draft" }, { status }] });
    const { unmount } = render(<Village lang="en" />);
    const { idea, hub } = await ideaAndHub();
    expect(idea.getByText("Done")).toBeTruthy();
    // a done step keeps a quiet link to the ideas
    const link = idea.getByRole("link", { name: "Your ideas" });
    expect(link.getAttribute("href")).toBe("/en/ideas/mine");
    expect(isMain(link)).toBe(false);
    expect(idea.queryByRole("link", { name: "Share an idea" })).toBeNull();
    expect(hub.getByText("Later")).toBeTruthy();
    unmount();
  }
});

test("being in a hub finishes both steps, and each keeps a quiet link", async () => {
  signedInAs({ roles: verifiedBackend() }, { hubs: [{ status: "active" }] });
  render(<Village lang="en" />);
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Done")).toBeTruthy();
  expect(idea.getByRole("link", { name: "Your ideas" }).getAttribute("href")).toBe("/en/ideas/mine");
  expect(hub.getByText("Done")).toBeTruthy();
  const hubs = hub.getByRole("link", { name: "Your hubs" });
  expect(hubs.getAttribute("href")).toBe("/en/hubs");
  expect(isMain(hubs)).toBe(false);
});

test("a hub that is archived still counts as one the developer built in", async () => {
  signedInAs({ roles: verifiedBackend() }, { hubs: [{ status: "archived" }] });
  render(<Village lang="en" />);
  const { hub } = await ideaAndHub();
  expect(hub.getByText("Done")).toBeTruthy();
  expect(hub.getByRole("link", { name: "Your hubs" })).toBeTruthy();
});

test("a waiting invitation stays the main button even when the hub step is done", async () => {
  signedInAs(
    { roles: [role("backend-engineer", "Backend & Systems Engineer")] },
    { hubs: [{ status: "active" }], invitations: [{ id: "hub-2" }] },
  );
  render(<Village lang="en" />);
  const { hub } = await ideaAndHub();
  expect(hub.getByText("Done")).toBeTruthy();
  expect(isMain(hub.getByRole("link", { name: "See your invitation" }))).toBe(true);
  expect(hub.queryByRole("link", { name: "Your hubs" })).toBeNull();
  // verifying is not the main thing now
  const verify = within(await step("Earn your Green Tick"));
  expect(isMain(verify.getByRole("link", { name: "Start verification" }))).toBe(false);
});

test("an invitation alone leaves the idea step open and makes the hub step next", async () => {
  signedInAs({ roles: verifiedBackend() }, { invitations: [{ id: "hub-2" }] });
  render(<Village lang="en" />);
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Open")).toBeTruthy();
  expect(hub.getByText("Next")).toBeTruthy();
  expect(isMain(hub.getByRole("link", { name: "See your invitation" }))).toBe(true);
});

test("a read that fails says nothing: the step falls back to what it said before", async () => {
  signedInAs({ roles: verifiedBackend() }, { ideas: null, hubs: null });
  render(<Village lang="en" />);
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Next")).toBeTruthy();
  expect(hub.getByText("Later")).toBeTruthy();
});

test("when only the hubs cannot be read, a shared idea still finishes its step", async () => {
  signedInAs({ roles: verifiedBackend() }, { ideas: [{ status: "open" }], hubs: null });
  render(<Village lang="en" />);
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Done")).toBeTruthy();
  expect(hub.getByText("Later")).toBeTruthy();
});

test("the steps follow the ideas and hubs again when the village is shown once more", async () => {
  signedInAs({ roles: verifiedBackend() });
  const { unmount } = render(<Village lang="en" />);
  expect(within(await step(IDEA)).getByText("Next")).toBeTruthy();
  unmount();
  signedInAs({ roles: verifiedBackend() }, { ideas: [{ status: "open" }] });
  render(<Village lang="en" />);
  expect(within(await step(IDEA)).getByText("Done")).toBeTruthy();
});

// A hub list that answers when told to; everything else answers as signedInAs set it up.
function holdHubs() {
  const hubs = Promise.withResolvers<Response>();
  const answer = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string) => (String(url).includes("/v1/me/hubs?offset") ? hubs.promise : answer(url)));
  return hubs;
}

test("a village kept hidden and shown again asks again, with no step from the last visit", async () => {
  signedInAs({ roles: verifiedBackend() });
  const { rerender } = render(
    <Activity mode="visible">
      <Village lang="en" />
    </Activity>,
  );
  expect(within(await step(IDEA)).getByText("Next")).toBeTruthy();
  // the developer joins a hub elsewhere, then comes back to the village that was kept
  const hubs = holdHubs();
  rerender(
    <Activity mode="hidden">
      <Village lang="en" />
    </Activity>,
  );
  rerender(
    <Activity mode="visible">
      <Village lang="en" />
    </Activity>,
  );
  // at once: the wait, and no step that is about to change
  expect(screen.getByText("Checking where you are")).toBeTruthy();
  expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  expect(screen.queryByText("Next")).toBeNull();
  hubs.resolve(new Response(JSON.stringify({ data: [{ status: "active" }], next_offset: null }), { status: 200 }));
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Done")).toBeTruthy();
  expect(hub.getByText("Done")).toBeTruthy();
});

test("a read that never answers does not keep the village hidden", async () => {
  signedInAs({ roles: verifiedBackend() });
  holdHubs();
  const limits: (() => void)[] = [];
  const realTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((run: () => void, ms?: number, ...rest: unknown[]) => {
    if (ms === READS_WAIT_MS) {
      limits.push(run);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return realTimeout(run, ms, ...rest);
  }) as typeof setTimeout);
  render(<Village lang="en" />);
  expect(await screen.findByText("Checking where you are")).toBeTruthy();
  expect(limits).toHaveLength(1);
  act(() => limits[0]());
  // the hub read counts as nothing known: both steps say what they said before the reads
  const { idea, hub } = await ideaAndHub();
  expect(idea.getByText("Next")).toBeTruthy();
  expect(hub.getByText("Later")).toBeTruthy();
  expect(screen.queryByText("Checking where you are")).toBeNull();
  vi.restoreAllMocks();
});

test("the done steps and the wait are in French", async () => {
  signedInAs({ roles: verifiedBackend() }, { hubs: [{ status: "active" }] });
  render(<Village lang="fr" />);
  expect(await screen.findByText("Vérification de votre avancement")).toBeTruthy();
  const idea = within(await step("Partager une idée, ou en rejoindre une"));
  expect(idea.getByText("Fait")).toBeTruthy();
  expect(idea.getByRole("link", { name: "Vos idées" }).getAttribute("href")).toBe("/fr/ideas/mine");
  expect(within(await step("Construire ensemble dans un espace")).getByRole("link", { name: "Vos espaces" })).toBeTruthy();
});

test("nobody who is not signed in is asked for ideas or hubs", async () => {
  localStorage.clear();
  const replace = vi.fn();
  vi.stubGlobal("location", { replace });
  render(<Village lang="en" />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/sign-in"));
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a role the web app does not know keeps the API's name", async () => {
  signedInAs({ roles: [role("game-engineer", "Game Engineer")] });
  render(<Village lang="fr" />);
  expect(await screen.findByText("Game Engineer")).toBeTruthy();
});

test("the demo account's username is plain text, since it is not on GitHub", async () => {
  signedInAs({ is_demo: true });
  render(<Village lang="en" />);
  expect(await screen.findByText("@aminata-n")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /GitHub profile/ })).toBeNull();
});

test("without a real name the username is shown once, linked to GitHub", async () => {
  signedInAs({ display_name: "aminata-n" });
  render(<Village lang="en" />);
  const link = await screen.findByRole("link", { name: "aminata-n (GitHub profile, opens in a new tab)" });
  expect(link.getAttribute("href")).toBe("https://github.com/aminata-n");
  expect(screen.queryByText("@aminata-n")).toBeNull();
});

test("the header leads home to the village and switches language on the same screen", async () => {
  signedInAs({});
  render(<Village lang="en" />);
  await screen.findByRole("heading", { level: 1 });
  expect(screen.getByRole("link", { name: "Village Sqwhere" }).getAttribute("href")).toBe("/en/village");
  expect(screen.getByRole("link", { name: "Français" }).getAttribute("href")).toBe("/fr/village");
  // the places: the village is where we are, and reviews wait for a Green Tick
  const places = within(screen.getByRole("navigation", { name: "Main" }));
  expect(places.getByRole("link", { name: "Village" }).getAttribute("aria-current")).toBe("page");
  expect(places.getByRole("link", { name: "Profile" }).getAttribute("href")).toBe("/en/profile");
  expect(places.queryByRole("link", { name: "Reviews" })).toBeNull();
});

test.each([
  ["en", "We couldn't open your village", "Try again"],
  ["fr", "Nous n'avons pas pu ouvrir votre village", "Réessayer"],
])("the error screen explains what happened and retries in %s", (lang, title, retry) => {
  route.lang = lang;
  const onRetry = vi.fn();
  render(<VillageError retry={onRetry} />);
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: retry }));
  expect(onRetry).toHaveBeenCalledOnce();
});

// every string in a value, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const shape = (value: unknown): unknown =>
  value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]))
    : "text";

test("English and French say the same things, with no dashes and no exclamation marks", () => {
  expect(shape(copy.fr)).toEqual(shape(copy.en));
  // the en dash and the em dash, as character codes so this file holds no dash itself
  const banned = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}!]`);
  for (const text of strings(copy)) {
    expect(text.trim()).not.toBe("");
    expect(text).not.toMatch(banned);
  }
});
