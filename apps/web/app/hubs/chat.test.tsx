import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { api, asked, fetchMock, hub, idea, owner, posted, refusal, reply } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const asMember = { viewer: { membership_status: "active", member_role: "member" } };
const asOutsider = { viewer: { membership_status: null, member_role: null } };
const asInvited = { viewer: { membership_status: "invited", member_role: "member" } };

const amina = { id: "id-amina", username: "amina-ndiaye", display_name: "Amina Ndiaye", avatar_url: null, is_verified: false };
const tendai = { ...amina, id: "id-tendai", username: "tendai-moyo", display_name: "Tendai Moyo" };

// a message sent `hours` ago, so its date reads the same on any day
const message = (id: string, body: string, hours: number, over: Record<string, unknown> = {}) => ({
  id,
  body,
  author: amina,
  reply_to: null,
  created_at: new Date(Date.now() - hours * 3_600_000).toISOString(),
  edited_at: null,
  can_edit: false,
  can_delete: false,
  ...over,
});
const page = (data: unknown[], next_offset: number | null = null) => ({ data, next_offset });
const MESSAGES = "GET /v1/hubs/hub-1/messages?offset=0&limit=50";

async function open(over: Record<string, unknown>, routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(over) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    [MESSAGES]: page([]),
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
}

const section = () => document.querySelector<HTMLElement>("section#chat")!;
const ready = () => screen.findByRole("heading", { name: /^(Team chat|Discussion de l'équipe)$/ });
const field = () => within(section()).getByRole<HTMLTextAreaElement>("textbox", { name: "Your message" });
const write = (value: string) => fireEvent.change(field(), { target: { value } });
const send = () => fireEvent.click(within(section()).getByRole("button", { name: "Send" }));
const items = () => within(section()).queryAllByRole("listitem");
const alertText = () => within(section()).getByRole("alert").textContent;

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

test("a member sees the chat before the team is confirmed, oldest message first, as plain text", async () => {
  await open(asMember, { [MESSAGES]: page([message("m-2", "Works for me", 1), message("m-1", "Standup at <b>9</b>?", 3)]) });
  await ready();
  await waitFor(() => expect(items()).toHaveLength(2));
  expect(items().map((item) => item.textContent)).toEqual([
    expect.stringContaining("Standup at <b>9</b>?"),
    expect.stringContaining("Works for me"),
  ]);
  expect(items()[0].textContent).toContain("Amina Ndiaye3 hours ago");
  expect(section().querySelector("b")).toBeNull();
});

test.each([
  ["someone outside the hub", asOutsider],
  ["someone who was only invited", asInvited],
])("%s sees no chat and no request is made for it", async (_who, over) => {
  await open(over);
  await screen.findByRole("heading", { name: "Phases" });
  expect(section()).toBeNull();
  expect(asked().filter((line) => line.includes("/messages"))).toEqual([]);
});

test("an empty chat invites the first message", async () => {
  await open(asMember);
  expect(await within(section()).findByText("No messages yet. Say hello to your team.")).toBeTruthy();
});

test("earlier messages load on request and go above the newest", async () => {
  await open(asMember, {
    [MESSAGES]: page([message("m-3", "Third", 1)], 1),
    "GET /v1/hubs/hub-1/messages?offset=1&limit=50": page([message("m-2", "Second", 2), message("m-1", "First", 3)]),
  });
  await waitFor(() => expect(items()).toHaveLength(1));
  fireEvent.click(within(section()).getByRole("button", { name: "Show earlier messages" }));
  await waitFor(() => expect(items()).toHaveLength(3));
  expect(items().map((item) => item.querySelector("p:last-of-type")?.textContent)).toEqual(["First", "Second", "Third"]);
  expect(within(section()).queryByRole("button", { name: "Show earlier messages" })).toBeNull();
});

test("a message is sent trimmed and shows at the end with a status line", async () => {
  await open(asMember, {
    [MESSAGES]: page([message("m-1", "First", 3)]),
    "POST /v1/hubs/hub-1/messages": reply(201, { data: message("m-2", "Reuse the SMS format", 0, { author: tendai }) }),
  });
  await waitFor(() => expect(items()).toHaveLength(1));
  write("  Reuse the SMS format  ");
  send();
  await waitFor(() => expect(posted()).toEqual([["/v1/hubs/hub-1/messages", { body: "Reuse the SMS format" }]]));
  await waitFor(() => expect(items()).toHaveLength(2));
  expect(items()[1].textContent).toContain("Reuse the SMS format");
  expect(within(section()).getByRole("status").textContent).toBe("Your message was sent.");
  expect(field().value).toBe("");
});

test("an empty or too long message is refused before anything is sent", async () => {
  await open(asMember);
  await ready();
  await waitFor(() => expect(within(section()).getByRole("button", { name: "Send" })).toBeTruthy());
  write("   ");
  send();
  expect(alertText()).toContain("Write a message before sending it.");
  write("x".repeat(10_001));
  send();
  expect(alertText()).toContain("A message can have at most 10000 characters.");
  expect(posted()).toEqual([]);
});

test("a reply quotes the message it answers", async () => {
  await open(asMember, {
    [MESSAGES]: page([message("m-1", "Standup at 9?", 3)]),
    "POST /v1/hubs/hub-1/messages": reply(201, {
      data: message("m-2", "Works for me", 0, { author: tendai, reply_to: { id: "m-1", author: amina, body: "Standup at 9?" } }),
    }),
  });
  await waitFor(() => expect(items()).toHaveLength(1));
  fireEvent.click(within(section()).getByRole("button", { name: "Reply to the message by Amina Ndiaye" }));
  expect(within(section()).getByText("Replying to Amina Ndiaye")).toBeTruthy();
  write("Works for me");
  send();
  await waitFor(() => expect(posted()).toEqual([["/v1/hubs/hub-1/messages", { body: "Works for me", reply_to_id: "m-1" }]]));
  await waitFor(() => expect(items()).toHaveLength(2));
  const quote = items()[1].querySelector("blockquote")!;
  expect(quote.textContent).toBe("Amina Ndiaye wroteStandup at 9?");
  expect(within(section()).queryByText("Replying to Amina Ndiaye")).toBeNull();
});

test("a quote of a deleted message says so", async () => {
  await open(asMember, { [MESSAGES]: page([message("m-2", "Agreed", 1, { reply_to: { id: "m-1", author: amina, body: null } })]) });
  await waitFor(() => expect(items()).toHaveLength(1));
  expect(items()[0].querySelector("blockquote")!.textContent).toBe("Amina Ndiaye wroteThis message was deleted.");
});

test("a reply whose quote was deleted meanwhile keeps the text and drops the quote", async () => {
  await open(asMember, {
    [MESSAGES]: page([message("m-1", "Standup at 9?", 3)]),
    "POST /v1/hubs/hub-1/messages": refusal(404, "MESSAGE_NOT_FOUND"),
  });
  await waitFor(() => expect(items()).toHaveLength(1));
  fireEvent.click(within(section()).getByRole("button", { name: "Reply to the message by Amina Ndiaye" }));
  write("Works for me");
  send();
  await waitFor(() => expect(alertText()).toContain("The message you replied to was deleted"));
  expect(field().value).toBe("Works for me");
  expect(within(section()).queryByText("Replying to Amina Ndiaye")).toBeNull();
});

test.each(["HUB_ARCHIVED", "HUB_CHANGED", "NOT_HUB_MEMBER"])("a send refused with %s reloads the hub and says why", async (code) => {
  await open(asMember, { "POST /v1/hubs/hub-1/messages": refusal(409, code) });
  await ready();
  await waitFor(() => expect(within(section()).getByRole("button", { name: "Send" })).toBeTruthy());
  write("Hello");
  send();
  await waitFor(() => expect(alertText()).toContain("This hub changed, so you can no longer write in its chat."));
  expect(asked().filter((line) => line === "GET /v1/hubs/hub-1").length).toBeGreaterThan(1);
});

test("an archived hub's chat is for reading only", async () => {
  await open({ ...asMember, status: "archived" }, { [MESSAGES]: page([message("m-1", "Done here", 3)]) });
  await waitFor(() => expect(items()).toHaveLength(1));
  expect(within(section()).getByText("This hub is archived. The chat stays here to read.")).toBeTruthy();
  expect(within(section()).queryByRole("textbox")).toBeNull();
  expect(within(section()).queryByRole("button", { name: /^Reply/ })).toBeNull();
});

test("a chat that cannot load offers to try again", async () => {
  await open(asMember, { [MESSAGES]: [reply(500), page([message("m-1", "Back again", 1)])] });
  expect(await within(section()).findByText(/We couldn't load the chat\./)).toBeTruthy();
  fireEvent.click(within(section()).getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(items()).toHaveLength(1));
});

test("the chat speaks French", async () => {
  await open(asMember, {}, "fr");
  await ready();
  expect(await within(section()).findByText("Pas encore de messages. Dites bonjour à votre équipe.")).toBeTruthy();
  expect(within(section()).getByRole("button", { name: "Envoyer" })).toBeTruthy();
});

const mine = (id: string, body: string, hours: number, over: Record<string, unknown> = {}) =>
  message(id, body, hours, { author: tendai, can_edit: true, can_delete: true, ...over });
const changed = (method: string) => fetchMock.mock.calls.filter(([, init]) => init?.method === method).map(([url, init]) => [String(url).replace("http://localhost:8000", ""), init.body ? JSON.parse(init.body) : null]);
const confirmDelete = () => fireEvent.click(within(screen.getByRole("dialog", { name: "Delete this message?" })).getByRole("button", { name: "Delete the message" }));

test("only the actions the API allows are offered on each message", async () => {
  await open(asMember, { [MESSAGES]: page([message("m-1", "Theirs", 3), mine("m-2", "Mine", 1)]) });
  await waitFor(() => expect(items()).toHaveLength(2));
  expect(within(items()[0]).queryByRole("button", { name: "Edit your message" })).toBeNull();
  expect(within(items()[0]).queryByRole("button", { name: /^Delete/ })).toBeNull();
  expect(within(items()[1]).getByRole("button", { name: "Edit your message" })).toBeTruthy();
  expect(within(items()[1]).getByRole("button", { name: "Delete the message by Tendai Moyo" })).toBeTruthy();
});

test("the author edits a message in place, and replies that quote it follow", async () => {
  await open(asMember, {
    [MESSAGES]: page([message("m-2", "Agreed", 1, { reply_to: { id: "m-1", author: tendai, body: "Standup at 9" } }), mine("m-1", "Standup at 9", 3)]),
    "PATCH /v1/hubs/hub-1/messages/m-1": { data: mine("m-1", "Standup at 10", 3, { edited_at: new Date().toISOString() }) },
  });
  await waitFor(() => expect(items()).toHaveLength(2));
  fireEvent.click(within(items()[0]).getByRole("button", { name: "Edit your message" }));
  const box = within(items()[0]).getByRole<HTMLTextAreaElement>("textbox", { name: "Your changed message" });
  expect(box.value).toBe("Standup at 9");
  fireEvent.change(box, { target: { value: " Standup at 10 " } });
  fireEvent.click(within(items()[0]).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(changed("PATCH")).toEqual([["/v1/hubs/hub-1/messages/m-1", { body: "Standup at 10" }]]));
  await waitFor(() => expect(items()[0].textContent).toContain("edited"));
  expect(items()[0].textContent).toContain("Standup at 10");
  expect(items()[1].querySelector("blockquote")!.textContent).toBe("Tendai Moyo wroteStandup at 10");
  expect(within(section()).getByRole("status").textContent).toBe("Your message was changed.");
});

test("an edit that fails keeps the form and the text", async () => {
  await open(asMember, { [MESSAGES]: page([mine("m-1", "Draft", 1)]), "PATCH /v1/hubs/hub-1/messages/m-1": reply(500) });
  await waitFor(() => expect(items()).toHaveLength(1));
  fireEvent.click(within(items()[0]).getByRole("button", { name: "Edit your message" }));
  const box = within(items()[0]).getByRole<HTMLTextAreaElement>("textbox", { name: "Your changed message" });
  fireEvent.change(box, { target: { value: "Better draft" } });
  fireEvent.click(within(items()[0]).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(within(section()).getAllByRole("alert").at(-1)!.textContent).toContain("We couldn't save that."));
  expect(within(items()[0]).getByRole<HTMLTextAreaElement>("textbox", { name: "Your changed message" }).value).toBe("Better draft");
});

test("a message is deleted after a confirmation, and replies that quoted it say so", async () => {
  await open(asMember, {
    [MESSAGES]: page([message("m-2", "Agreed", 1, { reply_to: { id: "m-1", author: tendai, body: "Standup at 9" } }), mine("m-1", "Standup at 9", 3)]),
    "DELETE /v1/hubs/hub-1/messages/m-1": new Response(null, { status: 204 }),
  });
  await waitFor(() => expect(items()).toHaveLength(2));
  fireEvent.click(within(items()[0]).getByRole("button", { name: "Delete the message by Tendai Moyo" }));
  confirmDelete();
  await waitFor(() => expect(items()).toHaveLength(1));
  expect(changed("DELETE")).toEqual([["/v1/hubs/hub-1/messages/m-1", null]]);
  expect(items()[0].querySelector("blockquote")!.textContent).toBe("Tendai Moyo wroteThis message was deleted.");
  expect(within(section()).getByRole("status").textContent).toBe("The message was deleted.");
});

test("a message already deleted elsewhere leaves the list with a line that says so", async () => {
  await open(asMember, { [MESSAGES]: page([mine("m-1", "Old", 3)]), "DELETE /v1/hubs/hub-1/messages/m-1": refusal(404, "MESSAGE_NOT_FOUND") });
  await waitFor(() => expect(items()).toHaveLength(1));
  fireEvent.click(within(items()[0]).getByRole("button", { name: "Delete the message by Tendai Moyo" }));
  confirmDelete();
  await waitFor(() => expect(items()).toHaveLength(0));
  expect(within(section()).getByRole("status").textContent).toBe("That message was already deleted.");
});

test("a delete refused to someone else says who may delete", async () => {
  await open(asMember, { [MESSAGES]: page([mine("m-1", "Old", 3)]), "DELETE /v1/hubs/hub-1/messages/m-1": refusal(403, "NOT_MESSAGE_AUTHOR") });
  await waitFor(() => expect(items()).toHaveLength(1));
  fireEvent.click(within(items()[0]).getByRole("button", { name: "Delete the message by Tendai Moyo" }));
  confirmDelete();
  await waitFor(() => expect(alertText()).toContain("only the author or the hub's owner can delete it"));
  expect(items()).toHaveLength(1);
});
