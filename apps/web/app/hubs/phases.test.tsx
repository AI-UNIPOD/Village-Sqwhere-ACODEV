import { Activity } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { HubPage } from "./hub-page";
import { api, asked, fetchMock, hub, idea, owner, phasesAt, posted, refusal } from "./test-support";

const nav = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useParams: () => ({ lang: "en" }),
}));

const asOwner = { viewer: { membership_status: "active", member_role: "owner" } };
const asMember = { viewer: { membership_status: "active", member_role: "member" } };
const asOutsider = { viewer: { membership_status: null, member_role: null } };
const asInvited = { viewer: { membership_status: "invited", member_role: "member" } };
// a hub the owner has confirmed, now at `phase`
const at = (phase: string, over: Record<string, unknown> = {}) => ({
  phase,
  team_confirmed_at: "2026-11-14T09:00:00Z",
  phases: phasesAt(phase),
  ...over,
});

async function open(over: Record<string, unknown>, routes: Record<string, unknown> = {}, lang: "en" | "fr" = "en") {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": { data: hub(over) },
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    ...routes,
  });
  render(<HubPage lang={lang} />);
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
}

const phases = () => document.querySelector<HTMLElement>("section#phases")!;
const rows = () => within(phases()).getAllByRole("listitem").map((row) => row.textContent);
const press = (name: string) => fireEvent.click(within(phases()).getByRole("button", { name }));
const confirmIn = (title: string, label: string) => fireEvent.click(within(screen.getByRole("dialog", { name: title })).getByRole("button", { name: label }));

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

test("an unstarted hub shows four phases that have not started, and marks none as the current step", async () => {
  await open(asMember);
  expect(rows()).toEqual(["01BrainstormNot started", "02Design and architectureNot started", "03BuildNot started", "04Review and testNot started"]);
  expect(phases().querySelector("[aria-current]")).toBeNull();
});

test("a hub in build shows the phases before it as done and marks Build as the current step", async () => {
  await open({ ...asMember, ...at("build") });
  expect(rows()).toEqual(["01BrainstormDone", "02Design and architectureDone", "03BuildIn progress", "04Review and testNot started"]);
  expect(phases().querySelector("[aria-current='step']")?.textContent).toContain("Build");
});

test("a hub in review shows the last phase in progress", async () => {
  await open({ ...asMember, ...at("review") });
  expect(rows()).toEqual(["01BrainstormDone", "02Design and architectureDone", "03BuildDone", "04Review and testIn progress"]);
});

test.each([
  ["the owner", asOwner, "Confirm the team when you are ready to start. Brainstorm opens, and you can still invite people after, up to five."],
  ["a member", asMember, "The phases open when the owner confirms the team."],
  ["someone outside the hub", asOutsider, "The phases open when the owner confirms the team."],
])("before the team is confirmed, %s reads where things stand", async (_who, viewer, line) => {
  await open(viewer);
  expect(within(phases()).getByText(line)).toBeTruthy();
});

test("once the team is confirmed, everyone reads that the owner moves the hub", async () => {
  await open({ ...asMember, ...at("brainstorm") });
  expect(within(phases()).getByText("The owner moves the hub from one phase to the next. Each phase has its tool on this page, which opens as the hub reaches that phase: the brainstorm notes, the design sketch, the build tab and the review checklist.")).toBeTruthy();
});

test.each([
  ["someone outside the hub", asOutsider],
  ["someone invited", asInvited],
])("once the team is confirmed, %s is not pointed to notes they cannot see", async (_who, viewer) => {
  await open({ ...viewer, ...at("brainstorm") });
  expect(
    within(phases()).getByText("The owner moves the hub from one phase to the next. Each phase has its tool on this page, for the hub's members: the brainstorm notes, the design sketch, the build tab and the review checklist."),
  ).toBeTruthy();
  expect(phases().textContent).not.toContain("notes below");
  expect(phases().textContent).not.toContain("still to come");
});

test.each([
  ["a member", asMember, "Le porteur fait passer l'espace d'une phase à la suivante. Chaque phase a son outil sur cette page, qui s'ouvre quand l'espace atteint cette phase\u202f: les notes du brainstorm, le schéma de conception, l'onglet de construction et la liste de vérification de la revue."],
  [
    "someone outside the hub",
    asOutsider,
    "Le porteur fait passer l'espace d'une phase à la suivante. Chaque phase a son outil sur cette page, réservé aux membres de l'espace\u202f: les notes du brainstorm, le schéma de conception, l'onglet de construction et la liste de vérification de la revue.",
  ],
])("in French, once the team is confirmed, %s reads where each tool is", async (_who, viewer, line) => {
  await open({ ...viewer, ...at("brainstorm") }, {}, "fr");
  // the text itself, not the page's normalised copy of it: the narrow no-break space before the semicolon is checked
  expect(phases().textContent).toContain(line);
});

test("the owner confirms the team after a dialog, and the page shows the card the API sent, with a status line", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/team/confirm": { data: hub({ ...asOwner, ...at("brainstorm") }) } });
  press("Confirm the team");
  const dialog = screen.getByRole("dialog", { name: "Confirm the team?" });
  expect(within(dialog).getByText(/^You are the only member for now\. Brainstorm opens/)).toBeTruthy();
  expect(posted()).toEqual([]);
  confirmIn("Confirm the team?", "Confirm the team");
  await waitFor(() => expect(posted()).toEqual([["/v1/hubs/hub-1/team/confirm", null]]));
  await waitFor(() => expect(within(phases()).getByRole("status").textContent).toContain("The team is confirmed. Brainstorm is open."));
  expect(rows()[0]).toBe("01BrainstormIn progress");
  expect(within(phases()).queryByRole("button", { name: "Confirm the team" })).toBeNull();
  expect(within(phases()).getByRole("button", { name: "Move to Design and architecture" })).toBeTruthy();
  // no reload: the hub was read once
  expect(asked().filter((line) => line === "GET /v1/hubs/hub-1")).toHaveLength(1);
});

test("the confirm dialog counts the team", async () => {
  await open({ ...asOwner, member_count: 3 });
  press("Confirm the team");
  expect(within(screen.getByRole("dialog")).getByText(/^3 people are in the team now\. Brainstorm opens/)).toBeTruthy();
});

test("cancelling the dialog sends nothing", async () => {
  await open(asOwner);
  press("Confirm the team");
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
  expect(posted()).toEqual([]);
});

test("the owner moves forward and back, each behind a dialog, and the body names the phase", async () => {
  await open({ ...asOwner, ...at("design") }, {
    "POST /v1/hubs/hub-1/phase": [{ data: hub({ ...asOwner, ...at("build") }) }, { data: hub({ ...asOwner, ...at("design") }) }],
  });
  expect(within(phases()).queryByRole("button", { name: "Confirm the team" })).toBeNull();
  press("Move to Build");
  expect(within(screen.getByRole("dialog", { name: "Move to Build?" })).getByText("The hub moves on to Build. You can move it back.")).toBeTruthy();
  confirmIn("Move to Build?", "Move to Build");
  await waitFor(() => expect(posted()).toEqual([["/v1/hubs/hub-1/phase", { phase: "build" }]]));
  await waitFor(() => expect(within(phases()).getByRole("status").textContent).toContain("The hub is now in Build."));
  expect(phases().querySelector("[aria-current='step']")?.textContent).toContain("Build");

  press("Back to Design and architecture");
  expect(within(screen.getByRole("dialog", { name: "Go back to Design and architecture?" })).getByText("The hub returns to Design and architecture. Nothing is deleted.")).toBeTruthy();
  confirmIn("Go back to Design and architecture?", "Back to Design and architecture");
  await waitFor(() => expect(posted()[1]).toEqual(["/v1/hubs/hub-1/phase", { phase: "design" }]));
  await waitFor(() => expect(phases().querySelector("[aria-current='step']")?.textContent).toContain("Design and architecture"));
});

test("a finished hub shows Finished on its last phase and offers no way back", async () => {
  await open({ ...asOwner, ...at("review"), finished_at: "2026-11-15T12:00:00Z" });
  expect(rows()).toEqual(["01BrainstormDone", "02Design and architectureDone", "03BuildDone", "04Review and testFinished"]);
  expect(within(phases()).queryAllByRole("button")).toHaveLength(0);
});

test("in French a finished hub says Terminée on its last phase", async () => {
  await open({ ...asMember, ...at("review"), finished_at: "2026-11-15T12:00:00Z" }, {}, "fr");
  expect(rows()[3]).toBe("04Revue et testsTerminée");
});

test("brainstorm has no way back, and review has no way forward", async () => {
  await open({ ...asOwner, ...at("brainstorm") });
  expect(within(phases()).queryByRole("button", { name: /^Back to/ })).toBeNull();
  cleanup();
  await open({ ...asOwner, ...at("review") });
  expect(within(phases()).queryByRole("button", { name: /^Move to/ })).toBeNull();
  expect(within(phases()).getByRole("button", { name: "Back to Build" })).toBeTruthy();
});

test.each([
  ["a member", asMember],
  ["someone outside the hub", asOutsider],
  ["the owner of an archived hub", { ...asOwner, status: "archived" }],
])("%s gets no buttons in the phases", async (_who, over) => {
  await open({ ...over, ...at("build") });
  expect(within(phases()).queryAllByRole("button")).toHaveLength(0);
  cleanup();
  await open({ ...over });
  expect(within(phases()).queryAllByRole("button")).toHaveLength(0);
});

test.each(["TEAM_ALREADY_CONFIRMED", "PHASE_NOT_ADJACENT", "TEAM_NOT_CONFIRMED"])(
  "%s means the hub changed elsewhere: it is loaded again and the page says so",
  async (code) => {
    await open(asOwner, {
      "POST /v1/hubs/hub-1/team/confirm": refusal(409, code),
      "GET /v1/hubs/hub-1": [{ data: hub(asOwner) }, { data: hub({ ...asOwner, ...at("design") }) }],
    });
    press("Confirm the team");
    confirmIn("Confirm the team?", "Confirm the team");
    await waitFor(() => expect(within(phases()).getByRole("alert").textContent).toContain("This hub was changed somewhere else. This is where it is now."));
    expect(phases().querySelector("[aria-current='step']")?.textContent).toContain("Design and architecture");
    expect(within(phases()).queryByText("English text from the API")).toBeNull();
    // the button that was pressed is gone with the reload, so the line takes the focus
    await waitFor(() => expect(document.activeElement).toBe(within(phases()).getByRole("alert")));
  },
);

test("HUB_FINISHED on the way back: the hub is loaded again, shows Finished, and the button is gone", async () => {
  await open({ ...asOwner, ...at("review") }, {
    "POST /v1/hubs/hub-1/phase": refusal(409, "HUB_FINISHED"),
    "GET /v1/hubs/hub-1": [{ data: hub({ ...asOwner, ...at("review") }) }, { data: hub({ ...asOwner, ...at("review"), finished_at: "2026-11-15T12:00:00Z" }) }],
  });
  press("Back to Build");
  confirmIn("Go back to Build?", "Back to Build");
  await waitFor(() => expect(within(phases()).getByRole("alert").textContent).toContain("That action is not available on this hub."));
  expect(rows()[3]).toBe("04Review and testFinished");
  expect(within(phases()).queryAllByRole("button")).toHaveLength(0);
});

test.each(["HUB_ARCHIVED", "NOT_HUB_OWNER"])("%s: the hub is loaded again and the page says the action is not available", async (code) => {
  await open(asOwner, {
    "POST /v1/hubs/hub-1/team/confirm": refusal(code === "HUB_ARCHIVED" ? 409 : 403, code),
    "GET /v1/hubs/hub-1": [{ data: hub(asOwner) }, { data: hub({ ...asMember, status: "archived" }) }],
  });
  press("Confirm the team");
  confirmIn("Confirm the team?", "Confirm the team");
  await waitFor(() => expect(within(phases()).getByRole("alert").textContent).toContain("That action is not available on this hub."));
  expect(within(phases()).queryAllByRole("button")).toHaveLength(0);
});

test("the demo's refusal says nothing was saved, not to try again, and keeps the buttons", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/team/confirm": refusal(403, "DEMO_READ_ONLY") });
  press("Confirm the team");
  confirmIn("Confirm the team?", "Confirm the team");
  await waitFor(() => expect(posted()).toHaveLength(1));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(within(phases()).getByRole("alert").textContent).toBe("Nothing was saved. The demo cannot be changed.");
  expect(within(phases()).getByRole("button", { name: "Confirm the team" })).toBeTruthy();
});

test("any other failure says nothing changed and keeps the buttons", async () => {
  await open(asOwner, { "POST /v1/hubs/hub-1/team/confirm": refusal(500, "INTERNAL") });
  press("Confirm the team");
  confirmIn("Confirm the team?", "Confirm the team");
  await waitFor(() => expect(within(phases()).getByRole("alert").textContent).toContain("We couldn't save that. Nothing changed, so try again."));
  // once the dialog has closed, the one button left with this name is the section's own
  await waitFor(() => expect(within(phases()).getByRole("button", { name: "Confirm the team" })).toBeTruthy());
});

test("the owner of an archived hub that was never confirmed is not told to confirm", async () => {
  await open({ ...asOwner, status: "archived" });
  expect(within(phases()).getByText("This hub is archived, so its phases will not start.")).toBeTruthy();
  expect(within(phases()).queryByText(/^Confirm the team when/)).toBeNull();
});

test("focus moves to the status line when the button that was pressed goes away", async () => {
  const statusFocused = () => expect(document.activeElement).toBe(within(phases()).getByRole("status"));
  await open(asOwner, { "POST /v1/hubs/hub-1/team/confirm": { data: hub({ ...asOwner, ...at("brainstorm") }) } });
  press("Confirm the team");
  confirmIn("Confirm the team?", "Confirm the team");
  await waitFor(statusFocused);
  cleanup();
  await open({ ...asOwner, ...at("build") }, { "POST /v1/hubs/hub-1/phase": { data: hub({ ...asOwner, ...at("review") }) } });
  press("Move to Review and test");
  confirmIn("Move to Review and test?", "Move to Review and test");
  await waitFor(statusFocused);
  cleanup();
  await open({ ...asOwner, ...at("design") }, { "POST /v1/hubs/hub-1/phase": { data: hub({ ...asOwner, ...at("brainstorm") }) } });
  press("Back to Brainstorm");
  confirmIn("Go back to Brainstorm?", "Back to Brainstorm");
  await waitFor(statusFocused);
});

test("showing the page again drops the status line from the last visit", async () => {
  nav.search = "id=hub-1";
  api({
    "GET /v1/hubs/hub-1": [{ data: hub(asOwner) }, { data: hub({ ...asOwner, ...at("build") }) }],
    "GET /v1/hubs/hub-1/members": { data: [owner()] },
    "GET /v1/hubs/hub-1/idea": { data: idea() },
    "GET /v1/hubs/hub-1/design": { data: { pieces: [], links: [] } },
    "POST /v1/hubs/hub-1/team/confirm": { data: hub({ ...asOwner, ...at("brainstorm") }) },
  });
  const page = (mode: "visible" | "hidden") => (
    <Activity mode={mode}>
      <HubPage lang="en" />
    </Activity>
  );
  const { rerender } = render(page("visible"));
  await screen.findByRole("heading", { level: 1, name: "Borehole map hub" });
  press("Confirm the team");
  confirmIn("Confirm the team?", "Confirm the team");
  await waitFor(() => expect(within(phases()).getByRole("status").textContent).toContain("The team is confirmed."));
  rerender(page("hidden"));
  rerender(page("visible"));
  await waitFor(() => expect(phases().querySelector("[aria-current='step']")?.textContent).toContain("Build"));
  expect(within(phases()).queryByRole("status")).toBeNull();
});

test("while a request runs the confirm button keeps its label, is busy, and a second press sends nothing", async () => {
  let finish: (value: Response) => void = () => {};
  await open(asOwner);
  const route = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    init?.method === "POST" ? new Promise<Response>((resolve) => (finish = resolve)) : route(url, init),
  );
  press("Confirm the team");
  confirmIn("Confirm the team?", "Confirm the team");
  const button = within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm the team" });
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
  fireEvent.click(button);
  expect(posted()).toHaveLength(1);
  finish(new Response(JSON.stringify({ data: hub({ ...asOwner, ...at("brainstorm") }) }), { status: 200 }));
  await waitFor(() => expect(within(phases()).getByRole("status")).toBeTruthy());
});

test("in French the phases, the line, the dialog and the status are French", async () => {
  await open({ ...asOwner }, { "POST /v1/hubs/hub-1/team/confirm": { data: hub({ ...asOwner, ...at("brainstorm") }) } }, "fr");
  expect(rows()[1]).toBe("02Conception et architecturePas commencée");
  expect(within(phases()).getByText(/^Confirmez l'équipe quand vous êtes prêt/)).toBeTruthy();
  press("Confirmer l'équipe");
  expect(within(screen.getByRole("dialog", { name: "Confirmer l'équipe\u202f?" })).getByText(/^Vous êtes le seul membre pour le moment/)).toBeTruthy();
  confirmIn("Confirmer l'équipe\u202f?", "Confirmer l'équipe");
  await waitFor(() => expect(within(phases()).getByRole("status").textContent).toContain("L'équipe est confirmée. Le brainstorm est ouvert."));
  expect(rows()[0]).toBe("01BrainstormEn cours");
  expect(within(phases()).getByRole("button", { name: "Passer à Conception et architecture" })).toBeTruthy();
});
