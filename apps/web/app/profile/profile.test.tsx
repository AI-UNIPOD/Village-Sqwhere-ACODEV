import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { copy } from "./copy";
import { ProfilePage } from "./profile-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
const refusal = (status: number, code: string) => reply(status, { detail: { code, message: "English text from the API" } });

const role = (slug: string, name: string, over: Record<string, unknown> = {}) => ({
  slug,
  name,
  is_primary: false,
  verified_at: null,
  verification: { attempts_used: 0, attempts_remaining: 3, latest_status: null },
  ...over,
});

const backend = role("backend-engineer", "Backend and Systems Engineer", { is_primary: true });
const devops = role("devops-cloud-engineer", "DevOps and Cloud Engineer");

const me = (over: Record<string, unknown> = {}) => ({
  username: "kwabena-owusu",
  display_name: "Kwabena Owusu",
  bio: "Backend engineer in Accra.",
  roles: [backend, devops],
  technologies: [
    { slug: "go", name: "Go" },
    { slug: "python", name: "Python" },
  ],
  sectors: [{ slug: "fintech", name: "Fintech" }],
  ...over,
});

// Answers each address by its longest matching start; a list of answers is used one per call.
function api(routes: Record<string, unknown>) {
  const used: Record<string, number> = {};
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const path = `${init?.method ?? "GET"} ${String(url).replace("http://localhost:8000", "")}`;
    const match = Object.keys(routes)
      .sort((a, b) => b.length - a.length)
      .find((route) => path.startsWith(route));
    if (!match) return Promise.resolve(reply(500, { detail: `no answer for ${path}` }));
    const answers = routes[match];
    const answer = Array.isArray(answers) ? answers[Math.min(used[match] ?? 0, answers.length - 1)] : answers;
    used[match] = (used[match] ?? 0) + 1;
    return Promise.resolve(answer instanceof Response ? answer.clone() : reply(200, answer));
  });
}

// the changes sent so far, as "METHOD path" and the body
const sent = (method?: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET" && (!method || init.method === method))
    .map(([url, init]) => [init.method, String(url).replace("http://localhost:8000", ""), init.body ? JSON.parse(init.body) : null]);

const press = (name: string | RegExp, within_: HTMLElement | Document = document.body) =>
  fireEvent.click(within(within_ as HTMLElement).getByRole("button", { name }));
const row = (name: string) => screen.getByRole("heading", { name }).closest("li") as HTMLElement;

async function page(profile: unknown = me(), routes: Record<string, unknown> = {}) {
  api({ "GET /v1/me": { data: profile }, ...routes });
  render(<ProfilePage lang="en" />);
  await screen.findByRole("heading", { name: "Your profile" });
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
});

test("while the profile loads there is a status and no form", () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  render(<ProfilePage lang="en" />);
  expect(screen.getByRole("status").textContent).toBe("Opening your profile");
  expect(screen.queryByLabelText("Name")).toBeNull();
});

test("the page shows the name, bio, roles with their states and the stack from the API", async () => {
  await page(
    me({
      roles: [
        backend,
        role("mobile-engineer", "Mobile Engineer", { verification: { attempts_used: 1, attempts_remaining: 2, latest_status: "in_progress" } }),
        role("ai-ml-engineer", "AI and ML Engineer", { verified_at: "2026-11-01T10:00:00Z" }),
      ],
    }),
  );
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Kwabena Owusu");
  expect((screen.getByLabelText("About you") as HTMLTextAreaElement).value).toBe("Backend engineer in Accra.");
  expect(screen.getByRole("link", { name: /@kwabena-owusu/ }).getAttribute("href")).toBe("https://github.com/kwabena-owusu");

  const main = within(row("Backend and Systems Engineer"));
  expect(main.getByText("Main role")).toBeTruthy();
  expect(main.getByText("Not verified")).toBeTruthy();
  expect(within(row("Mobile Engineer")).getByText("Being verified")).toBeTruthy();
  expect(within(row("AI and ML Engineer")).getByText("Verified")).toBeTruthy();

  expect(screen.getByRole("button", { name: "Go" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("button", { name: "Rust" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("2 selected")).toBeTruthy();
});

test("a developer with no real name sees the username once, and the name field holds it", async () => {
  await page(me({ username: "danladi", display_name: "danladi", bio: null }));
  expect(screen.getAllByText("danladi", { selector: "p a" }).length).toBe(1);
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("danladi");
  expect((screen.getByLabelText("About you") as HTMLTextAreaElement).value).toBe("");
});

test("saving the name sends only that field and shows Saved", async () => {
  await page(me(), { "PATCH /v1/me": { data: me({ display_name: "Kwabena O." }) } });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Kwabena O. " } });
  press("Save");
  await screen.findByText("Saved");
  expect(sent()).toEqual([["PATCH", "/v1/me", { display_name: "Kwabena O." }]]);
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Kwabena O.");
});

test("saving only the bio sends only the bio", async () => {
  await page(me(), { "PATCH /v1/me": { data: me({ bio: "Building in Accra." }) } });
  fireEvent.change(screen.getByLabelText("About you"), { target: { value: "Building in Accra." } });
  press("Save");
  await screen.findByText("Saved");
  expect(sent()).toEqual([["PATCH", "/v1/me", { bio: "Building in Accra." }]]);
});

test("an unchanged form sends nothing", async () => {
  await page();
  press("Save");
  await screen.findByText("Saved");
  expect(sent()).toEqual([]);
});

test("an empty name is refused before anything is sent, and the field says so", async () => {
  await page();
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
  press("Save");
  expect(screen.getByRole("alert").textContent).toBe("Enter a name of 1 to 80 characters.");
  expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  expect(sent()).toEqual([]);
  // the message goes the moment the value is fixed
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kofi" } });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a 422 on display_name marks that field and keeps the typed text", async () => {
  await page(me(), {
    "PATCH /v1/me": reply(422, { detail: [{ loc: ["body", "display_name"], msg: "too long", type: "string_too_long" }] }),
  });
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Kofi" } });
  press("Save");
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Name").getAttribute("aria-invalid")).toBe("true");
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Kofi");
  expect(screen.queryByText("Saved")).toBeNull();
});

test("a failed save keeps the text and says nothing was lost", async () => {
  await page(me(), { "PATCH /v1/me": refusal(500, "SERVER_ERROR") });
  fireEvent.change(screen.getByLabelText("About you"), { target: { value: "New bio" } });
  press("Save");
  expect((await screen.findByRole("alert")).textContent).toContain("Nothing you typed was lost");
  expect((screen.getByLabelText("About you") as HTMLTextAreaElement).value).toBe("New bio");
});

test("adding a role posts it, then shows what the API holds", async () => {
  const added = me({ roles: [backend, devops, role("mobile-engineer", "Mobile Engineer")] });
  await page(me(), {
    "POST /v1/me/roles": reply(201, { data: role("mobile-engineer", "Mobile Engineer") }),
    "GET /v1/me": [{ data: me() }, { data: added }],
  });
  press("Mobile Engineer", screen.getByRole("group", { name: "Add a role" }));
  expect(await screen.findByRole("heading", { name: "Mobile Engineer" })).toBeTruthy();
  expect(sent()).toEqual([["POST", "/v1/me/roles", { role: "mobile-engineer", is_primary: false }]]);
  // it left the chips
  expect(within(screen.getByRole("group", { name: "Add a role" })).queryByRole("button", { name: "Mobile Engineer" })).toBeNull();
});

test("a failed add says so under the chips and leaves the list alone", async () => {
  await page(me(), { "POST /v1/me/roles": refusal(500, "SERVER_ERROR") });
  press("Mobile Engineer", screen.getByRole("group", { name: "Add a role" }));
  expect((await screen.findByRole("alert")).textContent).toContain("We couldn't add that role");
  expect(screen.queryByRole("heading", { name: "Mobile Engineer" })).toBeNull();
});

test("a role already added somewhere else is shown, not reported as a failure", async () => {
  const added = me({ roles: [backend, devops, role("mobile-engineer", "Mobile Engineer")] });
  await page(me(), {
    "POST /v1/me/roles": refusal(409, "ROLE_ALREADY_CLAIMED"),
    "GET /v1/me": [{ data: me() }, { data: added }],
  });
  press("Mobile Engineer", screen.getByRole("group", { name: "Add a role" }));
  expect(await screen.findByRole("heading", { name: "Mobile Engineer" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("with all nine roles claimed there is nothing to add", async () => {
  const slugs = ["frontend-engineer", "backend-engineer", "mobile-engineer", "ai-ml-engineer", "mlops-data-engineer", "devops-cloud-engineer", "embedded-iot-engineer", "security-engineer", "ui-ux-engineer"];
  await page(me({ roles: slugs.map((slug, at) => role(slug, slug, { is_primary: at === 0 })) }));
  expect(screen.queryByText("Add a role")).toBeNull();
});

test("making a role the main one patches it and moves the pill", async () => {
  const swapped = me({ roles: [{ ...backend, is_primary: false }, { ...devops, is_primary: true }] });
  await page(me(), {
    "PATCH /v1/me/roles/devops-cloud-engineer": { data: devops },
    "GET /v1/me": [{ data: me() }, { data: swapped }],
  });
  press("Make it my main role", row("DevOps and Cloud Engineer"));
  await waitFor(() => expect(within(row("DevOps and Cloud Engineer")).getByText("Main role")).toBeTruthy());
  expect(within(row("Backend and Systems Engineer")).queryByText("Main role")).toBeNull();
  expect(sent()).toEqual([["PATCH", "/v1/me/roles/devops-cloud-engineer", { is_primary: true }]]);
  // the old main role can now be made the main one again, or removed
  expect(within(row("Backend and Systems Engineer")).getByRole("button", { name: "Remove" })).toBeTruthy();
});

test("removing asks first and deletes only after confirming", async () => {
  await page(me(), {
    "DELETE /v1/me/roles/devops-cloud-engineer": new Response(null, { status: 204 }),
    "GET /v1/me": [{ data: me() }, { data: me({ roles: [backend] }) }],
  });
  press("Remove", row("DevOps and Cloud Engineer"));
  expect(screen.getByRole("dialog").textContent).toContain("Ideas that need it will stop finding you through it.");
  expect(sent()).toEqual([]);
  press("Remove role");
  await waitFor(() => expect(screen.queryByRole("heading", { name: "DevOps and Cloud Engineer" })).toBeNull());
  expect(sent()).toEqual([["DELETE", "/v1/me/roles/devops-cloud-engineer", null]]);
});

test("cancelling the confirmation deletes nothing", async () => {
  await page();
  press("Remove", row("DevOps and Cloud Engineer"));
  press("Keep it");
  expect(sent()).toEqual([]);
  expect(screen.getByRole("heading", { name: "DevOps and Cloud Engineer" })).toBeTruthy();
});

test("a role with verification history says it stays, on its own row", async () => {
  await page(me(), { "DELETE /v1/me/roles/devops-cloud-engineer": refusal(409, "ROLE_HAS_VERIFICATION_HISTORY") });
  press("Remove", row("DevOps and Cloud Engineer"));
  press("Remove role");
  const note = await within(row("DevOps and Cloud Engineer")).findByRole("alert");
  expect(note.textContent).toBe("This role has verification attempts, so it stays on your profile.");
  expect(within(row("Backend and Systems Engineer")).queryByRole("alert")).toBeNull();
});

test("the main role has no Remove, and only the others offer Make it my main role", async () => {
  await page();
  const main = within(row("Backend and Systems Engineer"));
  expect(main.queryByRole("button", { name: "Remove" })).toBeNull();
  expect(main.queryByRole("button", { name: "Make it my main role" })).toBeNull();
  expect(screen.getByText("Verification is for your main role. Make another role the main one to verify it.")).toBeTruthy();
});

test("the main role that is not verified links to verification, with the label for an attempt under way", async () => {
  await page();
  expect(within(row("Backend and Systems Engineer")).getByRole("link", { name: "Verify this role" }).getAttribute("href")).toBe("/en/verification");
  cleanup();

  const underWay = { ...backend, verification: { attempts_used: 1, attempts_remaining: 2, latest_status: "awaiting_review" } };
  await page(me({ roles: [underWay] }));
  expect(within(row("Backend and Systems Engineer")).getByRole("link", { name: "See where it stands" }).getAttribute("href")).toBe("/en/verification");
  cleanup();

  await page(me({ roles: [{ ...backend, verified_at: "2026-11-01T10:00:00Z" }] }));
  expect(within(row("Backend and Systems Engineer")).queryByRole("link")).toBeNull();
});

test("a developer with no role sees the set-up button and no list", async () => {
  await page(me({ roles: [] }));
  expect(screen.getByText("You have not chosen a role yet.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Set up my profile" }).getAttribute("href")).toBe("/en/onboarding?step=role");
  expect(screen.queryByRole("list")).toBeNull();
  // Save stays the page's one main button
  expect(screen.getByRole("link", { name: "Set up my profile" }).className).not.toBe(screen.getByRole("button", { name: "Save" }).className);
  expect(screen.queryByText("Add a role")).toBeNull();
});

test("the stack button is disabled until a chip changes, then sends the whole list", async () => {
  await page(me(), { "PUT /v1/me/technologies": { data: [{ slug: "go", name: "Go" }, { slug: "python", name: "Python" }, { slug: "rust", name: "Rust" }] } });
  const save = screen.getByRole("button", { name: "Save stack" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(save);
  expect(sent()).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "Rust" }));
  expect(screen.getByText("3 selected")).toBeTruthy();
  expect(save.getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(save);
  await screen.findByText("Saved");
  expect(sent()).toEqual([["PUT", "/v1/me/technologies", { technologies: ["go", "rust", "python"] }]]);
  expect(save.getAttribute("aria-disabled")).toBe("true");
});

test("undoing a stack change disables the button again", async () => {
  await page();
  fireEvent.click(screen.getByRole("button", { name: "Rust" }));
  fireEvent.click(screen.getByRole("button", { name: "Rust" }));
  expect(screen.getByRole("button", { name: "Save stack" }).getAttribute("aria-disabled")).toBe("true");
});

test("a failed stack save keeps the selection and says so", async () => {
  await page(me(), { "PUT /v1/me/technologies": refusal(500, "SERVER_ERROR") });
  fireEvent.click(screen.getByRole("button", { name: "Rust" }));
  fireEvent.click(screen.getByRole("button", { name: "Save stack" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Your selection is still here");
  expect(screen.getByRole("button", { name: "Rust" }).getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("3 selected")).toBeTruthy();
});

test("the sectors chosen in onboarding show as pressed, and saving sends the whole list", async () => {
  await page(me(), { "PUT /v1/me/sectors": { data: [{ slug: "fintech", name: "Fintech" }, { slug: "health", name: "Health" }] } });
  const sectors = within(screen.getByRole("region", { name: "Sectors" }));
  expect(sectors.getByRole("button", { name: "Fintech" }).getAttribute("aria-pressed")).toBe("true");
  expect(sectors.getByRole("button", { name: "Health" }).getAttribute("aria-pressed")).toBe("false");
  const save = sectors.getByRole("button", { name: "Save sectors" });
  expect(save.getAttribute("aria-disabled")).toBe("true");

  fireEvent.click(sectors.getByRole("button", { name: "Health" }));
  expect(sectors.getByText("2 selected")).toBeTruthy();
  fireEvent.click(save);
  await sectors.findByText("Saved");
  expect(sent()).toEqual([["PUT", "/v1/me/sectors", { sectors: ["fintech", "health"] }]]);
  expect(save.getAttribute("aria-disabled")).toBe("true");
});

test("a failed sectors save keeps the selection and says so", async () => {
  await page(me(), { "PUT /v1/me/sectors": refusal(500, "SERVER_ERROR") });
  const sectors = within(screen.getByRole("region", { name: "Sectors" }));
  fireEvent.click(sectors.getByRole("button", { name: "Health" }));
  fireEvent.click(sectors.getByRole("button", { name: "Save sectors" }));
  expect((await sectors.findByRole("alert")).textContent).toBe(copy.en.sectors.failed);
  expect(sectors.getByRole("button", { name: "Health" }).getAttribute("aria-pressed")).toBe("true");
});

test("the sectors section is in French", async () => {
  api({ "GET /v1/me": { data: me() } });
  render(<ProfilePage lang="fr" />);
  const sectors = within(await screen.findByRole("region", { name: "Domaines" }));
  expect(sectors.getByRole("button", { name: "Santé" })).toBeTruthy();
  expect(sectors.getByRole("button", { name: "Enregistrer les domaines" })).toBeTruthy();
});

test("the account part has both languages, marking the current one, and a sign-out button", async () => {
  await page();
  // the header has its own language link, so the part is looked at by itself
  const account = within(screen.getByRole("region", { name: "Account" }));
  const english = account.getByRole("link", { name: "English" });
  const french = account.getByRole("link", { name: "Français" });
  expect(english.getAttribute("href")).toBe("/en/profile");
  expect(french.getAttribute("href")).toBe("/fr/profile");
  expect(english.getAttribute("aria-current")).toBe("true");
  expect(french.getAttribute("aria-current")).toBeNull();
  expect(account.getByRole("button", { name: "Sign out" })).toBeTruthy();
});

test("only one main button is on screen at rest", async () => {
  await page();
  const main = [...document.querySelectorAll("button, a")].filter((el) => el.className.includes("btn") && !el.className.includes("ghost"));
  expect(main.map((el) => el.textContent)).toEqual(["Save"]);
});

const strings = (value: unknown): string[] =>
  typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];

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
