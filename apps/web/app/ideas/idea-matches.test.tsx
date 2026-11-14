import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import IdeasError from "../[lang]/ideas/error";
import { api, asked, fetchMock, hub, idea, posted, refusal, reply } from "../hubs/test-support";
import { forgetMe, keepMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { IdeaMatches } from "./idea-matches";

const nav = vi.hoisted(() => ({ search: "id=idea-1" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const backend = { slug: "backend-engineer", name: "Backend & Systems Engineer" };
const mobile = { slug: "mobile-engineer", name: "Mobile Engineer" };
const react = { slug: "react", name: "React" };
const flutter = { slug: "flutter", name: "Flutter" };
const go = { slug: "go", name: "Go" };

// a made-up developer, as the matches answer gives them
const person = (username: string, display_name: string, over: Record<string, unknown> = {}) => ({
  id: `id-${username}`,
  username,
  display_name,
  avatar_url: null,
  is_verified: false,
  matched_roles: [backend],
  technologies: [],
  shared_technologies: [],
  country_code: null,
  ...over,
});

// Flutter comes first in her own list, React is the one she shares
const wanjiru = person("wanjiru-kamau", "Wanjiru Kamau", {
  is_verified: true,
  technologies: [flutter, go, react],
  shared_technologies: [go, react],
  country_code: "KE",
});
const danladi = person("danladi", "danladi", { matched_roles: [backend, mobile], technologies: [react], shared_technologies: [react] });
const fatou = person("fatou-sow", "Fatou Sow");

const open = (over: Record<string, unknown> = {}) => idea({ roles_needed: [backend, mobile], ...over });
const myHub = (over: Record<string, unknown> = {}) => hub({ member_count: 2, ...over });

// the page for the idea "idea-1", with what the API answers about it
async function show(routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  api({
    "GET /v1/me/ideas/idea-1/matches": { data: [wanjiru, danladi], next_offset: null },
    "GET /v1/me/ideas/idea-1": { data: open() },
    "GET /v1/me/hubs": { data: [myHub()], next_offset: null },
    ...routes,
  });
  render(<IdeaMatches lang={lang} />);
}

const cardOf = (name: string) => within(screen.getByText(name, { selector: "p, a" }).closest("li")!);
const title = (text: string) => screen.findByRole("heading", { level: 1, name: text });

beforeEach(() => {
  // the frame already knows who is signed in, as it does after the first screen of a visit
  keepMe({ username: "aminata-n", display_name: "Aminata Ndiaye", bio: null, country_code: null, roles: [], technologies: [], feed_topics: [], sectors: [] });
  nav.search = "id=idea-1";
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  forgetMe();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

// ---------- the list ----------

test("the page names the idea, leads back to Your ideas, and shows each developer with why they match", async () => {
  await show();
  await title("Who matches Borehole map for Kaduna");
  expect(screen.getByRole("link", { name: "Your ideas" }).getAttribute("href")).toBe("/en/ideas/mine");

  const first = cardOf("Wanjiru Kamau");
  const github = first.getByRole("link", { name: "@wanjiru-kamau (GitHub profile, opens in a new tab)" });
  expect(github.getAttribute("href")).toBe("https://github.com/wanjiru-kamau");
  expect(github.getAttribute("target")).toBe("_blank");
  expect(github.getAttribute("rel")).toBe("noopener noreferrer");
  expect(first.getByText("Verified")).toBeTruthy();
  expect(first.getByText("Verified in: Backend and Systems Engineer")).toBeTruthy();
  expect(first.getByText("Kenya")).toBeTruthy();
  expect(first.getByText("In common with you: Go, React")).toBeTruthy();

  // several roles, one shared technology, and a GitHub account with no name
  const second = cardOf("danladi");
  expect(second.getByText("Verified in: Backend and Systems Engineer, Mobile Engineer")).toBeTruthy();
  expect(second.getByText("In common with you: React")).toBeTruthy();
  expect(second.getByRole("link", { name: "danladi (GitHub profile, opens in a new tab)" })).toBeTruthy();
  expect(second.queryByText("Verified")).toBeNull();
  // no score, no percentage
  expect(screen.queryByText(/\d%|\bscore\b|\bAI\b/)).toBeNull();
});

test("the shared technologies come first in the tags, each marked with a tick and words for a screen reader", async () => {
  await show();
  await screen.findByText("Wanjiru Kamau");
  const tags = within(cardOf("Wanjiru Kamau").getByRole("list", { name: "Technologies" })).getAllByRole("listitem");
  expect(tags.map((tag) => tag.textContent)).toEqual(["Go (in common)", "React (in common)", "Flutter"]);
  expect(tags.map((tag) => !!tag.querySelector("svg"))).toEqual([true, true, false]);
  // the words are for a screen reader only: the tag's own text is the name
  expect(within(tags[0]).getByText("(in common)").className).toContain("srOnly");
});

test("a developer who shares no technology has no line about it, no marked tag, and one with none listed has no tags", async () => {
  await show({ "GET /v1/me/ideas/idea-1/matches": { data: [fatou, person("tendai-moyo", "Tendai Moyo", { technologies: [react] })], next_offset: null } });
  await screen.findByText("Fatou Sow");
  const row = cardOf("Fatou Sow");
  expect(row.getByText("Verified in: Backend and Systems Engineer")).toBeTruthy();
  expect(row.queryByText(/in common/)).toBeNull();
  expect(row.queryByRole("list")).toBeNull();
  const other = cardOf("Tendai Moyo");
  expect(other.queryByText(/in common/)).toBeNull();
  expect(other.getAllByRole("listitem").map((tag) => tag.textContent)).toEqual(["React"]);
  expect(other.getByRole("list", { name: "Technologies" }).querySelector("svg")).toBeNull();
});

test("the country shows by name in the page's language, and nothing for no country or a code the page does not know", async () => {
  const lands = (code: string | null, name: string) => person(name.toLowerCase(), name, { country_code: code });
  await show({
    "GET /v1/me/ideas/idea-1/matches": {
      data: [lands("CF", "Aya"), lands(null, "Bola"), lands("XX", "Chidi"), lands("ST", "Dele")],
      next_offset: null,
    },
  });
  await screen.findByText("Aya");
  expect(cardOf("Aya").getByText("Central African Republic")).toBeTruthy();
  expect(cardOf("Dele").getByText("São Tomé and Príncipe")).toBeTruthy();
  // a card with no country, or an unknown one, has the same lines as any other, and the country adds one
  const lines = (name: string) => screen.getByText(name, { selector: "p" }).closest("li")!.querySelectorAll("p").length;
  expect(lines("Chidi")).toBe(lines("Bola"));
  expect(lines("Aya")).toBe(lines("Bola") + 1);
  expect(cardOf("Chidi").queryByText("XX")).toBeNull();
});

test("the country is named in French on the French page", async () => {
  await show({ "GET /v1/me/ideas/idea-1/matches": { data: [person("dele", "Dele", { country_code: "ST" }), person("aya", "Aya", { country_code: "CF" })], next_offset: null } }, "fr");
  await screen.findByText("Dele");
  expect(cardOf("Dele").getByText("Sao Tomé-et-Principe")).toBeTruthy();
  expect(cardOf("Aya").getByText("Centrafrique")).toBeTruthy();
});

test("the same page in French, with the roles and the invite in French", async () => {
  await show({}, "fr");
  await title("Qui correspond à Borehole map for Kaduna");
  const first = cardOf("Wanjiru Kamau");
  // Testing Library reads the narrow no-break space as a plain one
  expect(first.getByText("Vérifié dans : Ingénieur backend et systèmes")).toBeTruthy();
  expect(first.getByText("Kenya")).toBeTruthy();
  expect(first.getByText("En commun avec vous : Go, React").textContent).toContain("vous\u202f: Go, React");
  expect(within(first.getByRole("list", { name: "Technologies" })).getAllByRole("listitem")[0].textContent).toBe("Go (en commun)");
  expect(cardOf("danladi").getByText("En commun avec vous : React")).toBeTruthy();
  expect(first.getByRole("button", { name: /^Inviter dans l'espace.: Wanjiru Kamau$/ })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Vos idées" })).toBeTruthy();
});

test("while the page loads there is a skeleton and no claim yet", async () => {
  await show();
  expect(screen.getByRole("status").textContent).toBe("Getting your ideas");
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  await title("Who matches Borehole map for Kaduna");
});

test("the idea, the hubs and the matches are asked for together", async () => {
  await show();
  await title("Who matches Borehole map for Kaduna");
  expect(asked().sort()).toEqual([
    "GET /v1/me/hubs?offset=0&limit=50",
    "GET /v1/me/ideas/idea-1",
    "GET /v1/me/ideas/idea-1/matches?offset=0&limit=20",
  ]);
});

test("Show more adds the next page, and a failed one keeps the list and says so", async () => {
  await show({
    "GET /v1/me/ideas/idea-1/matches?offset=0": { data: [wanjiru], next_offset: 20 },
    "GET /v1/me/ideas/idea-1/matches?offset=20": [refusal(500, "BOOM"), { data: [fatou], next_offset: null }],
  });
  await screen.findByText("Wanjiru Kamau");

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByText(/We couldn't load more developers/)).toBeTruthy();
  expect(screen.getByText("Wanjiru Kamau")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Show more" }));
  expect(await screen.findByText("Fatou Sow")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  expect(screen.queryByText(/We couldn't load more developers/)).toBeNull();
});

// ---------- inviting ----------

test("every developer has an invite button named for them, and none is the page's main button", async () => {
  await show();
  await screen.findByText("Wanjiru Kamau");
  const buttons = screen.getAllByRole("button", { name: /^Invite to the hub: / });
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Invite to the hub: Wanjiru Kamau", "Invite to the hub: danladi"]);
  expect(buttons.every((button) => button.className.includes("ghost"))).toBe(true);
  expect(screen.queryByRole("link", { name: "Create the hub" })).toBeNull();
});

test("a sent invitation becomes an Invited pill and a status line, and the row stays", async () => {
  await show({
    "POST /v1/hubs/hub-1/invitations": reply(201, {
      data: { user: { id: "id-wanjiru-kamau", username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true }, member_role: "member", status: "invited" },
    }),
  });
  await screen.findByText("Wanjiru Kamau");
  fireEvent.click(screen.getByRole("button", { name: "Invite to the hub: Wanjiru Kamau" }));

  const row = cardOf("Wanjiru Kamau");
  expect(await row.findByText("Invited")).toBeTruthy();
  expect(row.queryByRole("button")).toBeNull();
  expect(row.getByRole("status").textContent).toBe("Invitation sent to Wanjiru Kamau.");
  expect(row.getByText("Verified in: Backend and Systems Engineer")).toBeTruthy();
  expect(posted()).toEqual([["/v1/hubs/hub-1/invitations", { username: "wanjiru-kamau" }]]);
  // the button left, so focus moved to the person
  await waitFor(() => expect(document.activeElement).toBe(row.getByRole("link", { name: /@wanjiru-kamau/ })));
  // the others are untouched
  expect(screen.getByRole("button", { name: "Invite to the hub: danladi" })).toBeTruthy();
});

test.each([
  ["USER_NOT_FOUND", 404, "No developer here has that username. Check the spelling, or ask them to sign in to Village Sqwhere first."],
  ["ALREADY_MEMBER", 409, "They are already in this hub."],
  ["ALREADY_INVITED", 409, "They already have an invitation."],
  ["HUB_ARCHIVED", 409, "This hub is archived, so nobody can be invited."],
  ["TEAM_FULL", 409, "The team is full: five members is the most a hub takes."],
  ["BOOM", 500, "That did not go through. Nothing was changed, so try again."],
])("an invitation refused with %s says so beside the row and leaves the button to try again", async (code, status, sentence) => {
  await show({ "POST /v1/hubs/hub-1/invitations": refusal(status, code) });
  await screen.findByText("Wanjiru Kamau");
  fireEvent.click(screen.getByRole("button", { name: "Invite to the hub: Wanjiru Kamau" }));

  const row = cardOf("Wanjiru Kamau");
  expect((await row.findByRole("alert")).textContent).toContain(sentence);
  expect(row.getByRole("button", { name: "Invite to the hub: Wanjiru Kamau" })).toBeTruthy();
  expect(row.queryByText("Invited")).toBeNull();
  // the other developer shows nothing
  expect(cardOf("danladi").queryByRole("alert")).toBeNull();
});

test("a second try after a refusal clears the sentence", async () => {
  await show({
    "POST /v1/hubs/hub-1/invitations": [refusal(500, "BOOM"), reply(201, { data: { user: { id: "x", username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true }, member_role: "member", status: "invited" } })],
  });
  await screen.findByText("Wanjiru Kamau");
  const row = cardOf("Wanjiru Kamau");
  fireEvent.click(row.getByRole("button"));
  await row.findByRole("alert");
  fireEvent.click(row.getByRole("button"));
  expect(await row.findByText("Invited")).toBeTruthy();
  expect(row.queryByRole("alert")).toBeNull();
});

test("a team that is full cannot take another invitation: no buttons, and the note says why", async () => {
  await show({ "GET /v1/me/hubs": { data: [myHub({ member_count: 5 })], next_offset: null } });
  await screen.findByText("Wanjiru Kamau");
  expect(screen.getByText("The team is full: five members is the most a hub takes.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull();
  expect(screen.queryByRole("link", { name: "Create the hub" })).toBeNull();
});

test("the idea's hub is found on a later page of the owner's hubs", async () => {
  await show({
    "GET /v1/me/hubs?offset=0": { data: [hub({ id: "hub-9", idea: { id: "idea-2", title: "Another", summary: "x" } })], next_offset: 50 },
    "GET /v1/me/hubs?offset=50": { data: [myHub()], next_offset: null },
  });
  await screen.findByText("Wanjiru Kamau");
  expect(screen.getAllByRole("button", { name: /Invite/ }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("link", { name: "Create the hub" })).toBeNull();
});

test("an idea with no hub yet lists the developers with no invite buttons, and one notice with the way to a hub", async () => {
  await show({ "GET /v1/me/hubs": { data: [hub({ id: "hub-9", idea: { id: "idea-2", title: "Another", summary: "x" } })], next_offset: null } });
  await screen.findByText("Wanjiru Kamau");
  expect(screen.getByRole("heading", { level: 2, name: "You need a hub to invite" })).toBeTruthy();
  const create = screen.getAllByRole("link", { name: "Create the hub" });
  expect(create).toHaveLength(1);
  expect(create[0].getAttribute("href")).toBe("/en/hubs/new?idea=idea-1");
  expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull();
  // the why is still there
  expect(cardOf("Wanjiru Kamau").getByText("In common with you: Go, React")).toBeTruthy();
});

// ---------- the states ----------

test("an idea that is not published says so and leads to the composer", async () => {
  await show({
    "GET /v1/me/ideas/idea-1": { data: open({ status: "draft" }) },
    "GET /v1/me/ideas/idea-1/matches": refusal(409, "IDEA_NOT_OPEN"),
  });
  expect(await screen.findByRole("heading", { level: 2, name: "Publish the idea to see who matches" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1, name: "Who matches Borehole map for Kaduna" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open your idea" }).getAttribute("href")).toBe("/en/ideas/compose?id=idea-1");
  expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull();
});

test("a closed idea is told it is closed, with no promise to publish it", async () => {
  await show({
    "GET /v1/me/ideas/idea-1": { data: open({ status: "closed" }) },
    "GET /v1/me/ideas/idea-1/matches": refusal(409, "IDEA_NOT_OPEN"),
  });
  expect(await screen.findByRole("heading", { level: 2, name: "This idea is closed" })).toBeTruthy();
  expect(screen.queryByText(/Publish the idea/)).toBeNull();
  expect(screen.getAllByRole("link", { name: "Your ideas" }).length).toBeGreaterThan(0);
});

test.each([
  ["an idea that is not theirs or does not exist", "id=idea-1", refusal(404, "NOT_FOUND")],
  ["an address that is not an id", "id=nope", reply(422, { detail: [{ loc: ["path", "idea_id"], msg: "bad" }] })],
])("%s gets the missing screen and a way back", async (_name, search, answer) => {
  nav.search = search;
  await show({ "GET /v1/me/ideas/": answer, "GET /v1/me/ideas/idea-1": answer, "GET /v1/me/ideas/idea-1/matches": answer });
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this idea" })).toBeTruthy();
  expect(screen.getByText("It may have been removed, or it belongs to another account.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Your ideas" }).getAttribute("href")).toBe("/en/ideas/mine");
});

test("an address with no id gets the missing screen without asking the API", async () => {
  nav.search = "";
  await show();
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this idea" })).toBeTruthy();
  expect(asked()).toEqual([]);
});

test("an idea that needs no roles explains that matching goes by roles, and leads to the composer", async () => {
  await show({
    "GET /v1/me/ideas/idea-1": { data: open({ roles_needed: [] }) },
    "GET /v1/me/ideas/idea-1/matches": { data: [], next_offset: null },
  });
  expect(await screen.findByRole("heading", { level: 2, name: "This idea names no roles yet" })).toBeTruthy();
  expect(screen.getByText(/Matching goes by the roles an idea needs/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Add roles" }).getAttribute("href")).toBe("/en/ideas/compose?id=idea-1");
});

test("roles but nobody verified in them yet says the list fills as people verify, and points at the hub's invite form", async () => {
  await show({ "GET /v1/me/ideas/idea-1/matches": { data: [], next_offset: null } });
  expect(await screen.findByRole("heading", { level: 2, name: "No verified developer holds these roles yet" })).toBeTruthy();
  expect(screen.getByText(/The list fills as developers verify their roles/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Invite by GitHub username" }).getAttribute("href")).toBe("/en/hubs/view?id=hub-1");
});

test("nobody verified yet and no hub: the one way on is the notice that creates the hub", async () => {
  await show({ "GET /v1/me/ideas/idea-1/matches": { data: [], next_offset: null }, "GET /v1/me/hubs": { data: [], next_offset: null } });
  expect(await screen.findByRole("heading", { level: 2, name: "No verified developer holds these roles yet" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Invite by GitHub username" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "Create the hub" })).toHaveLength(1);
});

class Catcher extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <IdeasError retry={() => this.setState({ failed: false })} /> : this.props.children;
  }
}

test("a page that cannot load shows the ideas error screen, and Try again asks again", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  api({
    "GET /v1/me/ideas/idea-1/matches": [refusal(500, "BOOM"), { data: [wanjiru], next_offset: null }],
    "GET /v1/me/ideas/idea-1": { data: open() },
    "GET /v1/me/hubs": { data: [myHub()], next_offset: null },
  });
  render(
    <Catcher>
      <IdeaMatches lang="en" />
    </Catcher>,
  );
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't show your ideas" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Wanjiru Kamau")).toBeTruthy();
  vi.restoreAllMocks();
});

test("another idea is another page: what was loaded for one never shows for the next", async () => {
  api({
    "GET /v1/me/ideas/idea-1/matches": { data: [wanjiru], next_offset: null },
    "GET /v1/me/ideas/idea-1": { data: open() },
    "GET /v1/me/ideas/idea-2/matches": { data: [fatou], next_offset: null },
    "GET /v1/me/ideas/idea-2": { data: open({ id: "idea-2", title: "Clinic queue for Kano" }) },
    "GET /v1/me/hubs": { data: [], next_offset: null },
  });
  const view = render(<IdeaMatches lang="en" />);
  await screen.findByText("Wanjiru Kamau");

  nav.search = "id=idea-2";
  view.rerender(<IdeaMatches lang="en" />);
  expect(screen.queryByText("Wanjiru Kamau")).toBeNull();
  expect(await screen.findByText("Fatou Sow")).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1, name: "Who matches Clinic queue for Kano" })).toBeTruthy();
});
