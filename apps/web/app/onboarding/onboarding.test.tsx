import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { Lang } from "../locales";
import { SESSION_KEY } from "../session/session";
import { Onboarding, SignedInOnboarding } from "./onboarding";
import type { Profile } from "./options";
import { ANSWERS_KEY } from "./saved-answers";

const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  return { push, replace, router: { push, replace }, search: "" };
});

vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useParams: () => ({ lang: "en" }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  sessionStorage.clear();
  nav.search = "";
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  // jsdom cannot draw, so the hero shows its still frame
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // a spy left on storage would block the next test's session
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

// A made-up developer, as GitHub would describe them.
const profile: Profile = { displayName: "Aminata Diallo", username: "aminata-builds" };

// Renders the flow and returns a function that moves the mocked URL to another step, the way
// the router would after a push.
function start(lang: Lang = "en", step = "") {
  nav.search = step && `step=${step}`;
  const view = render(<Onboarding lang={lang} profile={profile} />);
  return (to: string) => {
    nav.search = `step=${to}`;
    view.rerender(<Onboarding lang={lang} profile={profile} />);
  };
}

const click = (role: "button" | "radio", name: string | RegExp) =>
  fireEvent.click(screen.getByRole(role, { name }));
const heading = (name: string) => screen.getByRole("heading", { level: 1, name });

test("the welcome screen greets the developer and offers to set up or skip", () => {
  start();
  expect(heading("Welcome to the village, Aminata.")).toBeTruthy();
  expect(screen.getByText("Signed in with GitHub as @aminata-builds")).toBeTruthy();
  expect(document.querySelector("section > button")?.textContent).toContain("Pause animation");
  expect(screen.getByRole("link", { name: "Français" }).getAttribute("href")).toBe("/fr/onboarding");

  click("button", "Set up my profile");
  expect(nav.push).toHaveBeenCalledWith("/en/onboarding?step=role", { scroll: false });
  click("button", "Skip for now");
  expect(nav.push).toHaveBeenCalledWith("/en/onboarding?step=done", { scroll: false });
});

// Browser translation turned "Village Sqwhere" into "Village Square" and would rename the language.
test.each([
  ["en", "Français"],
  ["fr", "English"],
] as const)("the %s header keeps the brand name and the language link out of translation", (lang, label) => {
  start(lang);
  expect(screen.getByText("Village Sqwhere").getAttribute("translate")).toBe("no");
  expect(screen.getByRole("link", { name: label }).getAttribute("translate")).toBe("no");
});

test("the welcome screen is in French on /fr", () => {
  start("fr");
  expect(heading("Bienvenue au village, Aminata.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/en/onboarding");
  click("button", "Configurer mon profil");
  expect(nav.push).toHaveBeenCalledWith("/fr/onboarding?step=role", { scroll: false });
});

test("Continue without a role shows an error and stays; picking a role goes on", () => {
  start("en", "role");
  click("button", "Continue");
  const alert = screen.getByRole("alert");
  expect(alert.textContent).toBe("Pick the role you do most to continue.");
  expect(nav.push).not.toHaveBeenCalled();
  expect(screen.getByRole("group").getAttribute("aria-describedby")).toContain(alert.id);

  click("radio", /Frontend Engineer/);
  expect(screen.queryByRole("alert")).toBeNull();
  click("button", "Continue");
  expect(nav.push).toHaveBeenCalledWith("/en/onboarding?step=stack", { scroll: false });
});

test("the role step offers the nine API roles, each with a hint", () => {
  start("fr", "role");
  expect(screen.getAllByRole("radio")).toHaveLength(9);
  const frontend = screen.getByRole("radio", { name: /Ingénieur frontend/ });
  expect(frontend.closest("label")?.textContent).toContain("Interfaces web, React, Vue");
});

test("each question step announces itself, shows its progress and takes focus", () => {
  const go = start();
  expect(document.activeElement).toBe(document.body);

  go("role");
  click("radio", /Frontend Engineer/);
  go("stack");
  expect(screen.getByText("Step 2 of 5")).toBeTruthy();
  expect(screen.getByText("Step 2 of 5: What do you build with?").getAttribute("role")).toBe("status");
  expect(document.activeElement).toBe(heading("What do you build with?"));
});

test("Back goes to the previous step", () => {
  start("en", "role");
  click("button", "Back");
  expect(nav.push).toHaveBeenCalledWith("/en/onboarding", { scroll: false });
});

// the answers the later steps need: a role and one technology
function answerRequired(go: (to: string) => void, role: RegExp = /Frontend Engineer/) {
  go("role");
  click("radio", role);
  go("stack");
  click("button", "React");
}

test("the stack filter narrows the chips and shows an empty state that can be cleared", () => {
  const go = start();
  answerRequired(go);
  const filter = screen.getByLabelText("Filter technologies");

  fireEvent.change(filter, { target: { value: "REACT" } });
  expect(screen.getByRole("button", { name: "React Native" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Docker" })).toBeNull();

  fireEvent.change(filter, { target: { value: "xyz" } });
  expect(screen.getByText('No technology matches "xyz". Check the spelling or clear the filter.')).toBeTruthy();
  click("button", "Clear filter");
  expect((filter as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("button", { name: "Docker" })).toBeTruthy();
});

test("stack chips toggle aria-pressed and the count follows", () => {
  const go = start();
  answerRequired(go);
  const react = screen.getByRole("button", { name: "React" });
  const docker = screen.getByRole("button", { name: "Docker" });
  expect(react.getAttribute("aria-pressed")).toBe("true");
  expect(docker.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("1 selected").getAttribute("role")).toBe("status");

  fireEvent.click(docker);
  expect(docker.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("2 selected")).toBeTruthy();
  fireEvent.click(react);
  expect(react.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText("1 selected")).toBeTruthy();
});

// A tick inside the chip made it wider, so chips jumped to another row as picks built up.
test("a chip looks the same size when pressed: only its fill changes, nothing is added", () => {
  const go = start();
  answerRequired(go);
  const docker = screen.getByRole("button", { name: "Docker" });
  const before = docker.innerHTML;
  fireEvent.click(docker);
  expect(docker.getAttribute("aria-pressed")).toBe("true");
  expect(docker.innerHTML).toBe(before);
  expect(docker.querySelector("svg")).toBeNull();

  go("topics");
  const fintech = screen.getByRole("button", { name: "Fintech" });
  const topicBefore = fintech.innerHTML;
  fireEvent.click(fintech);
  expect(fintech.getAttribute("aria-pressed")).toBe("true");
  expect(fintech.innerHTML).toBe(topicBefore);
  expect(fintech.querySelector("svg")).toBeNull();
});

test("Continue with no technology shows an error and stays", () => {
  const go = start();
  go("role");
  click("radio", /Frontend Engineer/);
  go("stack");
  nav.push.mockClear();
  click("button", "Continue");
  expect(screen.getByRole("alert").textContent).toBe("Pick at least one technology to continue.");
  expect(nav.push).not.toHaveBeenCalled();
});

test("a link to a later step without the earlier answers goes back to the role", () => {
  start("en", "stack");
  expect(nav.replace).toHaveBeenCalledWith("/en/onboarding?step=role");
  expect(heading("What do you do most?")).toBeTruthy();
});

test("an unknown step shows the welcome screen", () => {
  start("en", "banana");
  expect(heading("Welcome to the village, Aminata.")).toBeTruthy();
  expect(nav.replace).not.toHaveBeenCalled();
});

test("the country list is in the page language, sorted for it, and the step can be skipped", () => {
  const go = start("fr");
  answerRequired(go, /Ingénieur frontend/);
  go("country");
  const names = screen.getAllByRole("radio").map((radio) => radio.closest("label")?.textContent ?? "");
  expect(names).toHaveLength(54);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
  expect(names).toContain("Côte d'Ivoire");

  fireEvent.change(screen.getByLabelText("Filtrer les pays"), { target: { value: "senegal" } });
  expect(screen.getAllByRole("radio")).toHaveLength(1);
  expect(screen.getByRole("radio", { name: "Sénégal" })).toBeTruthy();

  nav.push.mockClear();
  click("button", "Passer");
  expect(nav.push).toHaveBeenCalledWith("/fr/onboarding?step=topics", { scroll: false });
});

test("the feed step asks which technologies to read about, and can take the stack in one press", () => {
  const go = start();
  answerRequired(go);
  click("button", "Docker");
  go("feed");
  expect(heading("What do you want to read about?")).toBeTruthy();
  expect(screen.getByText("Step 5 of 5")).toBeTruthy();
  // one bar per question, all filled on the last one
  expect(document.querySelectorAll("[aria-hidden='true'] > span[data-done]")).toHaveLength(5);
  // nothing is chosen for the person: none means every post
  expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);

  click("button", "Python");
  expect(screen.getByRole("button", { name: "Python" }).getAttribute("aria-pressed")).toBe("true");

  click("button", "Use my stack");
  const pressed = screen.getAllByRole("button", { pressed: true }).map((chip) => chip.textContent);
  expect(pressed.sort()).toEqual(["Docker", "React"]);
  // once the stack is the answer, the button has nothing left to do
  expect(screen.queryByRole("button", { name: "Use my stack" })).toBeNull();

  // it can be skipped, like the country and the sectors
  nav.push.mockClear();
  click("button", "Skip");
  expect(nav.push).toHaveBeenCalledWith("/en/onboarding?step=done", { scroll: false });
});

test("the profile card shows what was chosen", () => {
  const go = start();
  answerRequired(go);
  click("button", "Docker");
  go("country");
  click("radio", "Senegal");
  go("topics");
  click("button", "Fintech");
  go("feed");
  click("button", "Python");
  go("done");

  expect(heading("You're in, Aminata.")).toBeTruthy();
  expect(screen.getByText("Aminata Diallo")).toBeTruthy();
  expect(screen.getByText("@aminata-builds")).toBeTruthy();
  expect(screen.getByText("Frontend Engineer")).toBeTruthy();
  expect(screen.getByText("Senegal")).toBeTruthy();
  const tags = screen.getAllByRole("listitem").map((item) => item.textContent);
  expect(tags).toEqual(expect.arrayContaining(["React", "Docker", "Fintech", "Python"]));
  expect(tags).not.toContain("Go");
  expect(screen.getByText("Saving your answers")).toBeTruthy();

  const next = screen.getByRole("heading", { name: "What happens next" }).nextElementSibling as HTMLElement;
  expect(within(next).getAllByRole("listitem")).toHaveLength(3);

  // nobody is signed in here, so the save never ends and the way to the village stays closed
  expect(screen.getByRole("button", { name: "Go to the village" }).getAttribute("aria-disabled")).toBe("true");

  click("button", "Change my answers");
  expect(nav.push).toHaveBeenCalledWith("/en/onboarding?step=role", { scroll: false });
});

test("after skipping from the welcome screen the card invites the developer to finish", () => {
  start("en", "done");
  expect(screen.getByText("Role not chosen yet")).toBeTruthy();
  expect(screen.getByText("Finish your profile any time")).toBeTruthy();
  expect(screen.queryByText("Stack")).toBeNull();
  click("button", "Set up my profile");
  expect(nav.push).toHaveBeenCalledWith("/en/onboarding?step=role", { scroll: false });
});

// A reload, a dropped tab or a hot reload remounts the page. WCAG 3.3.7: nothing the person
// already entered may be asked for again.
test("a reload on a later step keeps the step and the answers", () => {
  const go = start();
  answerRequired(go);
  cleanup();

  const goAgain = start("en", "country");
  expect(nav.replace).not.toHaveBeenCalled();
  expect(heading("Where do you build from?")).toBeTruthy();

  goAgain("stack");
  expect(screen.getByRole("button", { name: "React" }).getAttribute("aria-pressed")).toBe("true");
  goAgain("role");
  expect((screen.getByRole("radio", { name: /Frontend Engineer/ }) as HTMLInputElement).checked).toBe(true);
});

test("a corrupt saved value is ignored: no answers, and a later step goes back to the role", () => {
  sessionStorage.setItem(ANSWERS_KEY, "{not json");
  start("en", "country");
  expect(nav.replace).toHaveBeenCalledWith("/en/onboarding?step=role");
  expect(heading("What do you do most?")).toBeTruthy();
  expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
});

test("blocked storage falls back to answers kept in the page only", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("blocked", "SecurityError");
  });
  const go = start();
  go("role");
  click("radio", /Frontend Engineer/);
  go("stack");
  go("role");
  expect((screen.getByRole("radio", { name: /Frontend Engineer/ }) as HTMLInputElement).checked).toBe(true);
});

// The row sticks to the bottom of the screen on the question steps only (see the stylesheet).
test("only the question steps get the sticky Continue row", () => {
  start("en", "role");
  expect(screen.getByRole("button", { name: "Continue" }).parentElement?.className).toContain("questionActions");
  cleanup();

  start("en", "done");
  expect(screen.getByRole("button", { name: "Set up my profile" }).parentElement?.className).not.toContain(
    "questionActions",
  );
});

// The role cards rise in one after another. That entrance is for the first arrival only: when
// the person comes back to the step, the cards are already there and must not move again.
const roleCards = () => screen.getAllByRole("radio")[0].closest("[data-entrance]")?.getAttribute("data-entrance");

test("the role cards play their entrance when the role step is reached from the welcome screen", () => {
  const go = start();
  click("button", "Set up my profile");
  go("role");
  expect(roleCards()).toBe("play");
});

test("the role cards are at rest after Back from the stack step", () => {
  const go = start();
  click("button", "Set up my profile");
  go("role");
  click("radio", /Frontend Engineer/);
  click("button", "Continue");
  go("stack");
  click("button", "Back");
  go("role");
  expect(roleCards()).toBe("rest");
});

test("the role cards are at rest after Change my answers", () => {
  const go = start();
  answerRequired(go);
  go("done");
  click("button", "Change my answers");
  go("role");
  expect(roleCards()).toBe("rest");
});

// The page as the address opens it: signed in, with GET /v1/me answering these roles.
function open(roles: unknown[], step = "") {
  nav.search = step && `step=${step}`;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
  const me = { username: "aminata-builds", display_name: "Aminata Diallo", roles, technologies: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: me }), { status: 200 })));
  render(<SignedInOnboarding lang="en" />);
}

const backend = { slug: "backend-engineer", name: "Backend & Systems Engineer", is_primary: true, verified_at: null };

test("a developer who already has a role goes from the bare address to the village", async () => {
  open([backend]);
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/en/village"));
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});

test("a link to a step still opens for a developer who has a role", async () => {
  open([backend], "role");
  expect(await screen.findByRole("heading", { level: 1, name: "What do you do most?" })).toBeTruthy();
  expect(nav.replace).not.toHaveBeenCalledWith("/en/village");
});

test("a developer with no role yet gets the welcome", async () => {
  open([]);
  expect(await screen.findByRole("heading", { level: 1, name: "Welcome to the village, Aminata." })).toBeTruthy();
  expect(nav.replace).not.toHaveBeenCalledWith("/en/village");
});
