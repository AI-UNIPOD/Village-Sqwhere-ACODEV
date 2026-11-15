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

const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const asMember = { viewer: { membership_status: "active", member_role: "member" } };

async function open(hubOver: Record<string, unknown>, routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(hubOver) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1 });
}

const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const nameField = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Hub name" });
const descriptionField = () => screen.getByRole<HTMLTextAreaElement>("textbox", { name: "What the team will do first (optional)" });
const patched = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([url, init]) => [String(url).replace("http://localhost:8000", ""), JSON.parse(init.body)]);
const archiveDialog = () => screen.getByRole("dialog", { name: "Archive this hub?" });

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

test("only the owner of an active hub can edit or archive it", async () => {
  await open(asOwner);
  expect(screen.getByRole("button", { name: "Edit the name and description" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Archive this hub" })).toBeTruthy();
  for (const over of [asMember, { ...asOwner, status: "archived" }]) {
    cleanup();
    await open(over);
    expect(screen.queryByRole("button", { name: "Edit the name and description" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive this hub" })).toBeNull();
  }
});

test("the owner renames and describes the hub in place", async () => {
  await open(asOwner, { "PATCH /v1/hubs/hub-1": { data: hub({ ...asOwner, name: "Borehole finder", description: null }) } });
  press("Edit the name and description");
  expect(nameField().value).toBe("Borehole map hub");
  expect(descriptionField().value).toBe("Start with the SMS format.");
  expect(document.activeElement).toBe(nameField());
  fireEvent.change(nameField(), { target: { value: "  Borehole finder  " } });
  fireEvent.change(descriptionField(), { target: { value: "   " } });
  press("Save");
  expect(await screen.findByRole("heading", { level: 1, name: "Borehole finder" })).toBeTruthy();
  expect(patched()).toEqual([["/v1/hubs/hub-1", { name: "Borehole finder", description: null }]]);
  expect(screen.getByText("The hub was saved.").getAttribute("role")).toBe("status");
  expect(screen.queryByText("Start with the SMS format.")).toBeNull();
  expect(screen.queryByRole("textbox", { name: "Hub name" })).toBeNull();
});

test("a blank or too long name and a too long description are refused before anything is sent", async () => {
  await open(asOwner);
  press("Edit the name and description");
  fireEvent.change(nameField(), { target: { value: "  " } });
  press("Save");
  expect(screen.getByText("Give the hub a name.")).toBeTruthy();
  expect(document.activeElement).toBe(nameField());
  fireEvent.change(nameField(), { target: { value: "x".repeat(121) } });
  fireEvent.change(descriptionField(), { target: { value: "y".repeat(2001) } });
  press("Save");
  expect(screen.getByText("Shorten the name to 120 characters or fewer.")).toBeTruthy();
  expect(screen.getByText("Shorten this to 2,000 characters or fewer.")).toBeTruthy();
  expect(patched()).toEqual([]);
});

test("Cancel closes the form and keeps the hub as it was", async () => {
  await open(asOwner);
  press("Edit the name and description");
  fireEvent.change(nameField(), { target: { value: "Something else" } });
  press("Cancel");
  expect(screen.getByRole("heading", { level: 1, name: "Borehole map hub" })).toBeTruthy();
  expect(patched()).toEqual([]);
});

test("an edit refused because the hub was archived elsewhere shows the hub as it is now", async () => {
  await open(asOwner, {
    "GET /v1/hubs/hub-1": [{ data: hub(asOwner) }, { data: hub({ ...asOwner, status: "archived" }) }],
    "PATCH /v1/hubs/hub-1": refusal(409, "HUB_ARCHIVED"),
  });
  press("Edit the name and description");
  press("Save");
  expect((await screen.findByText("This hub can no longer be edited. This is how it stands now.")).getAttribute("role")).toBe("alert");
  expect(screen.getByText("Archived")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit the name and description" })).toBeNull();
});

test("a failed edit keeps the form and what was typed", async () => {
  await open(asOwner, { "PATCH /v1/hubs/hub-1": reply(500) });
  press("Edit the name and description");
  fireEvent.change(nameField(), { target: { value: "Borehole finder" } });
  press("Save");
  expect(await screen.findByText("We couldn't save that. Nothing changed, so try again.")).toBeTruthy();
  expect(nameField().value).toBe("Borehole finder");
});

test("archiving asks first, then shows the hub archived with no owner tools", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/archive": { data: hub({ ...asOwner, status: "archived" }) } });
  press("Archive this hub");
  fireEvent.click(within(archiveDialog()).getByRole("button", { name: "Keep it active" }));
  expect(posted()).toEqual([]);
  press("Archive this hub");
  fireEvent.click(within(archiveDialog()).getByRole("button", { name: "Archive the hub" }));
  const done = await screen.findByText("The hub was archived. It stays here to read.");
  expect(done.getAttribute("role")).toBe("status");
  // focus moves once the dialog has closed
  await waitFor(() => expect(document.activeElement).toBe(done));
  expect(posted()).toEqual([["/v1/hubs/hub-1/archive", null]]);
  expect(screen.getByText("Archived")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Archive this hub" })).toBeNull();
});

test("an archive that fails says so and keeps the hub active", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/archive": reply(500) });
  press("Archive this hub");
  fireEvent.click(within(archiveDialog()).getByRole("button", { name: "Archive the hub" }));
  await waitFor(() => expect(within(document.querySelector<HTMLElement>("section#archive")!).getByRole("alert")).toBeTruthy());
  expect(screen.getByText("Active")).toBeTruthy();
  expect(asked().filter((line) => line === "GET /v1/hubs/hub-1")).toHaveLength(1);
});

test("the owner's tools speak French", async () => {
  await open(asOwner, {}, "fr");
  expect(screen.getByRole("button", { name: "Modifier le nom et la description" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Archiver l'espace" })).toBeTruthy();
});
