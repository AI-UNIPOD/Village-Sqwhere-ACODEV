import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { blocksOf } from "./agreement-text";
import { copy } from "./copy";
import { HubPage } from "./hub-page";
import { MyHubs } from "./my-hubs";
import { NewHub } from "./new-hub";
import { agreement, api, demoRefusal, fetchMock, hub, idea, owner, posted, refusal, reply, saidNotSaved } from "./test-support";

const nav = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push, replace: vi.fn() }, search: "" };
});

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

// the create form, loaded for an open idea
async function form(routes: Record<string, unknown> = {}) {
  nav.search = "idea=idea-1";
  api({ "GET /v1/me/ideas/idea-1": { data: idea() }, "GET /v1/agreements/current": { data: agreement() }, ...routes });
  render(<NewHub lang="en" />);
  return (await screen.findByLabelText("Hub name")) as HTMLInputElement;
}

function fillAndSign() {
  fireEvent.click(screen.getByRole("checkbox", { name: "I have read this agreement and the terms above." }));
  type("Your full legal name", "  Kwabena Owusu ");
  press("Sign and create the hub");
}

beforeEach(() => {
  nav.search = "";
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
});

// ---------- the agreement text ----------

test("the agreement's Markdown becomes headings, lists and paragraphs, and nothing else", () => {
  expect(blocksOf(agreement().body as string)).toEqual([
    { kind: "heading", level: 1, text: "Hub agreement" },
    { kind: "text", text: "Members keep the idea private." },
    { kind: "list", items: ["No <b>sharing</b>", "See [the terms](http://example.com)"] },
    { kind: "text", text: "1. First clause" },
    { kind: "text", text: "2. Second clause" },
  ]);
});

// ---------- creating a hub ----------

test("the form names the idea, prefills the hub name and shows the agreement as the server sends it", async () => {
  const name = await form();
  expect(name.value).toBe("Borehole map for Kaduna");
  expect(screen.getByText(/A hub is where your team builds Borehole map for Kaduna/)).toBeTruthy();
  expect(screen.getByText("Village Sqwhere hub agreement")).toBeTruthy();
  expect(screen.getByText("Version 2")).toBeTruthy();

  const text = within(screen.getByRole("region", { name: "Agreement text" }));
  expect(text.getByRole("heading", { name: "Hub agreement" })).toBeTruthy();
  // markup inside the text is shown as the characters it is, never run
  expect(text.getByText("No <b>sharing</b>")).toBeTruthy();
  expect(text.getByText("See [the terms](http://example.com)")).toBeTruthy();
  expect(text.queryByRole("link")).toBeNull();
});

test("the agreement is shown with no warning about its text, whatever its title", async () => {
  await form({ "GET /v1/agreements/current": { data: agreement({ version: 1, title: "TEST AGREEMENT (NOT LEGAL TEXT)" }) } });
  expect(screen.getByText("TEST AGREEMENT (NOT LEGAL TEXT)")).toBeTruthy();
  expect(screen.queryByText(/placeholder/i)).toBeNull();
});

test("nothing is signed without a name, the notes a custom split needs, the read box and a legal name", async () => {
  const name = await form();
  fireEvent.change(name, { target: { value: "  " } });
  fireEvent.click(screen.getByRole("radio", { name: /Custom/ }));
  press("Sign and create the hub");
  expect(screen.getByText("Give the hub a name.")).toBeTruthy();
  expect(screen.getByText("Say in the notes how ownership is shared.")).toBeTruthy();
  expect(screen.getByText("Read the agreement, then tick this box to sign.")).toBeTruthy();
  expect(screen.getByText("Type your full legal name, at least 2 characters.")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(posted()).toEqual([]);

  // an error leaves when its field is right
  fireEvent.change(name, { target: { value: "Borehole hub" } });
  expect(screen.queryByText("Give the hub a name.")).toBeNull();
});

test("signing says back what is signed, then sends the text that was shown", async () => {
  await form({ "POST /v1/hubs": reply(201, { data: hub({ id: "new-hub" }) }) });
  type("What the team will do first (optional)", "Start with the SMS format.");
  fireEvent.click(screen.getByRole("radio", { name: /Owner majority/ }));
  type("Notes", "The owner keeps 60%.");
  fillAndSign();

  const dialog = screen.getByRole("dialog", { name: "Create this hub?" });
  expect(within(dialog).getByText("Borehole map for Kaduna")).toBeTruthy();
  expect(within(dialog).getByText("Owner majority")).toBeTruthy();
  expect(within(dialog).getByText("Signed as Kwabena Owusu")).toBeTruthy();
  expect(within(dialog).getByText("The terms cannot be changed afterwards.")).toBeTruthy();
  expect(posted()).toEqual([]);

  fireEvent.click(within(dialog).getByRole("button", { name: "Sign and create" }));
  await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/en/hubs/view?id=new-hub&created=1"));
  expect(posted()).toEqual([
    [
      "/v1/hubs",
      {
        idea_id: "idea-1",
        name: "Borehole map for Kaduna",
        description: "Start with the SMS format.",
        terms: { ownership_model: "owner_majority", notes: "The owner keeps 60%." },
        agreement: { template_id: "template-1", template_sha256: "a".repeat(64), signed_legal_name: "Kwabena Owusu" },
      },
    ],
  ]);
});

test("an equal split needs no notes and sends none", async () => {
  await form({ "POST /v1/hubs": reply(201, { data: hub() }) });
  fillAndSign();
  fireEvent.click(screen.getByRole("button", { name: "Sign and create" }));
  await waitFor(() => expect(nav.push).toHaveBeenCalled());
  expect(posted()[0][1]).toMatchObject({ description: null, terms: { ownership_model: "equal_split" } });
  expect(posted()[0][1].terms).not.toHaveProperty("notes");
});

test("when the agreement changed, the new text is shown and must be read before signing again", async () => {
  await form({
    "GET /v1/agreements/current": [{ data: agreement() }, { data: agreement({ version: 2, body: "# New text", body_sha256: "b".repeat(64) }) }],
    "POST /v1/hubs": refusal(409, "AGREEMENT_MISMATCH"),
  });
  fillAndSign();
  fireEvent.click(screen.getByRole("button", { name: "Sign and create" }));

  expect(await screen.findByText("The agreement changed while you were reading. Read the new text, then sign again.")).toBeTruthy();
  expect(await screen.findByText("Version 2")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Agreement text" })).getByRole("heading", { name: "New text" })).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  // what was typed stays
  expect((screen.getByLabelText("Your full legal name") as HTMLInputElement).value).toBe("  Kwabena Owusu ");
  expect(nav.push).not.toHaveBeenCalled();
});

test("a failed send says so and keeps everything typed", async () => {
  await form({ "POST /v1/hubs": reply(500) });
  fillAndSign();
  fireEvent.click(screen.getByRole("button", { name: "Sign and create" }));
  expect(await screen.findByText(/We couldn't create the hub. Nothing you typed was lost/)).toBeTruthy();
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText("Hub name") as HTMLInputElement).value).toBe("Borehole map for Kaduna");
});

test("the demo's refused hub says nothing was saved as a status, with no alert, and keeps everything typed", async () => {
  await form({ "POST /v1/hubs": demoRefusal() });
  fillAndSign();
  fireEvent.click(screen.getByRole("button", { name: "Sign and create" }));
  await saidNotSaved();
  expect((screen.getByLabelText("Hub name") as HTMLInputElement).value).toBe("Borehole map for Kaduna");
});

test("an idea that already has a hub leads to your hubs", async () => {
  await form({ "POST /v1/hubs": refusal(409, "HUB_ALREADY_EXISTS") });
  fillAndSign();
  fireEvent.click(screen.getByRole("button", { name: "Sign and create" }));
  expect(await screen.findByRole("heading", { level: 1, name: "This idea already has a hub" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Your hubs" }).getAttribute("href")).toBe("/en/hubs");
});

test.each([
  ["a draft idea", { "GET /v1/me/ideas/idea-1": { data: idea({ status: "draft" }) } }, "Publish the idea first", "Open the idea", "/en/ideas/compose?id=idea-1"],
  ["an idea that is not yours", { "GET /v1/me/ideas/idea-1": refusal(404, "NOT_FOUND") }, "We couldn't find this idea", "Your ideas", "/en/ideas/mine"],
  ["a server with no agreement", { "GET /v1/agreements/current": refusal(503, "AGREEMENT_NOT_PUBLISHED") }, "Hubs cannot be created right now", "Your ideas", "/en/ideas/mine"],
])("%s gets no form, only the reason and the way on", async (_name, routes, title, link, href) => {
  nav.search = "idea=idea-1";
  api({ "GET /v1/me/ideas/idea-1": { data: idea() }, "GET /v1/agreements/current": { data: agreement() }, ...routes });
  render(<NewHub lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
  expect(screen.getByRole("link", { name: link }).getAttribute("href")).toBe(href);
  expect(screen.queryByLabelText("Your full legal name")).toBeNull();
});

test("with no idea in the address, nothing is loaded and the page says so", () => {
  render(<NewHub lang="en" />);
  expect(screen.getByRole("heading", { level: 1, name: "We couldn't find this idea" })).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
});

// ---------- one hub ----------

test("the owner sees the hub, its idea, the terms as signed and the four phases", async () => {
  nav.search = "id=hub-1&created=1";
  api({ "GET /v1/hubs/hub-1": { data: hub() }, "GET /v1/hubs/hub-1/members": { data: [owner()] }, "GET /v1/hubs/hub-1/idea": { data: idea() } });
  render(<HubPage lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "Borehole map hub" })).toBeTruthy();
  expect(screen.getByText("Your hub is ready. You are its owner and first member.").getAttribute("role")).toBe("status");
  expect(screen.getByText("Active")).toBeTruthy();
  expect(screen.getByText("1 of 5 members")).toBeTruthy();
  expect(screen.getByText("Custom")).toBeTruthy();
  expect(screen.getByText("The owner keeps 40%.")).toBeTruthy();
  expect(screen.getByText("Version 1 of the hub agreement")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Edit the idea" }).getAttribute("href")).toBe("/en/ideas/compose?id=idea-1");
  for (const phase of ["Brainstorm", "Design and architecture", "Build", "Review and test"]) expect(screen.getByText(phase)).toBeTruthy();
  const profile = await screen.findByRole("link", { name: "Kwabena Owusu" });
  expect(profile.getAttribute("href")).toBe("/en/people/view?username=kwabena-owusu");
  expect(screen.getByText("@kwabena-owusu")).toBeTruthy();
});

// The hub arrives after the page, so the browser's own jump to an address's hash finds nothing,
// and its team and brief arrive after the hub, so the page grows after the first scroll.
test("the team and the phases are parts the address can name, and the page scrolls to the one named, again as the page grows, until the person takes over", async () => {
  const scroll = vi.fn();
  window.scrollTo = scroll as unknown as typeof window.scrollTo;
  let grew = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        grew = callback;
      }
      observe() {
        grew();
      }
      disconnect() {
        grew = () => {};
      }
    },
  );
  history.replaceState(null, "", "/en/hubs/view?id=hub-1#phases");
  nav.search = "id=hub-1";
  api({ "GET /v1/hubs/hub-1": { data: hub() }, "GET /v1/hubs/hub-1/members": { data: [owner()] }, "GET /v1/hubs/hub-1/idea": { data: idea() } });
  const { container } = render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  const phases = container.querySelector<HTMLElement>("section#phases")!;
  expect(within(phases).getByRole("heading", { level: 2, name: "Phases" })).toBeTruthy();
  expect(within(container.querySelector<HTMLElement>("section#team")!).getByRole("heading", { level: 2, name: "Team" })).toBeTruthy();
  await waitFor(() => expect(scroll).toHaveBeenCalledOnce());
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });

  // the team arrives and the page grows: the phases have moved down, and are brought back
  phases.getBoundingClientRect = () => ({ top: 150 }) as DOMRect;
  grew();
  expect(scroll).toHaveBeenCalledTimes(2);
  expect(scroll).toHaveBeenLastCalledWith({ top: 150, behavior: "smooth" });
  // the person scrolls: the page is theirs
  fireEvent.wheel(window);
  grew();
  expect(scroll).toHaveBeenCalledTimes(2);
  history.replaceState(null, "", "/");
});

test("with no hash in the address, or one that names nothing, the page stays where it is", async () => {
  const scroll = vi.fn();
  window.scrollTo = scroll as unknown as typeof window.scrollTo;
  nav.search = "id=hub-1";
  api({ "GET /v1/hubs/hub-1": { data: hub() }, "GET /v1/hubs/hub-1/members": { data: [owner()] }, "GET /v1/hubs/hub-1/idea": { data: idea() } });
  const first = render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  expect(scroll).not.toHaveBeenCalled();
  first.unmount();

  // an address is typed by anyone: a hash that is no id, or not even a valid selector, does nothing
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private grew: () => void) {}
      observe() {
        this.grew();
      }
      disconnect() {}
    },
  );
  history.replaceState(null, "", "/en/hubs/view?id=hub-1#nothing]here");
  render(<HubPage lang="en" />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  expect(scroll).not.toHaveBeenCalled();
  history.replaceState(null, "", "/");
});

test("someone who is not a member is told so, and gets no owner's links", async () => {
  nav.search = "id=hub-1&created=1";
  api({ "GET /v1/hubs/hub-1": { data: hub({ viewer: { membership_status: null, member_role: null } }) } });
  render(<HubPage lang="fr" />);
  expect(await screen.findByText("Vous n'êtes pas membre de cet espace.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Modifier l'idée" })).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText(/^Membres.: 1 sur 5$/)).toBeTruthy();
});

test("a hub that is not there says so and leads back", async () => {
  nav.search = "id=gone";
  api({ "GET /v1/hubs/gone": refusal(404, "NOT_FOUND") });
  render(<HubPage lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this hub" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Your hubs" }).getAttribute("href")).toBe("/en/hubs");
});

// ---------- your hubs ----------

test("your hubs list each hub with your part in it, and open it", async () => {
  const second = hub({ id: "hub-2", name: "Clinic queue hub", status: "archived", member_count: 3, viewer: { membership_status: "active", member_role: "member" } });
  api({ "GET /v1/me/hubs": { data: [hub(), second], next_offset: null }, "GET /v1/me/hubs?status=requested": { data: [] }, "GET /v1/me/hubs?status=invited": { data: [] } });
  render(<MyHubs lang="en" />);
  const first = await screen.findByRole("link", { name: "Borehole map hub" });
  expect(first.getAttribute("href")).toBe("/en/hubs/view?id=hub-1");
  expect(first.closest("li")!.textContent).toContain("Owner · 1 of 5 members");
  const other = screen.getByRole("link", { name: "Clinic queue hub" }).closest("li")!;
  expect(other.textContent).toContain("Member · 3 of 5 members");
  expect(within(other).getByText("Archived")).toBeTruthy();
});

test("with no hubs, the page says where a hub comes from", async () => {
  api({ "GET /v1/me/hubs": { data: [], next_offset: null }, "GET /v1/me/hubs?status=requested": { data: [] }, "GET /v1/me/hubs?status=invited": { data: [] } });
  render(<MyHubs lang="en" />);
  expect(await screen.findByRole("heading", { level: 2, name: "No hubs yet" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Your ideas" }).getAttribute("href")).toBe("/en/ideas/mine");
});

// ---------- copy ----------

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const shape = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(shape)
    : value && typeof value === "object"
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
