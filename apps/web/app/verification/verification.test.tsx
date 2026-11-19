import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import VerificationError from "../[lang]/verification/error";
import { API_URL, SESSION_KEY } from "../session/session";
import { copy } from "./copy";
import { Verification } from "./verification";

const route = vi.hoisted(() => ({ lang: "en" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ lang: route.lang }) }));

const fetchMock = vi.fn();

const ATTEMPT_ID = "00000000-0000-4000-9000-000000000007";

const role = (over: object = {}) => ({
  slug: "backend-engineer",
  name: "Backend & Systems Engineer",
  is_primary: true,
  verified_at: null,
  verification: { attempts_used: 0, attempts_remaining: 3, latest_status: null },
  ...over,
});

const attempt = (over: object = {}) => ({
  id: ATTEMPT_ID,
  attempt_number: 1,
  language: "en",
  status: "pending",
  current_phase: "codebase_analysis",
  last_error: null,
  evidence: [{ repository_url: "https://github.com/fatou-sow/ledger-api" }],
  reviewer_notes: null,
  started_at: "2026-11-10T12:00:00Z",
  created_at: "2026-11-10T12:00:00Z",
  ...over,
});

// what the local API answers: the developer and the attempts for their role, newest first
const world = { roles: [] as unknown[], attempts: [] as unknown[] };
const overrides = new Map<string, () => Response | Promise<Response>>();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const refused = (status: number, code: string) => json({ detail: { code, message: "English text" } }, status);

function signedInWith(roles: unknown[], attempts: unknown[] = []) {
  world.roles = roles;
  world.attempts = attempts;
}

const key = (call: unknown[]) => `${(call[1] as RequestInit | undefined)?.method ?? "GET"} ${String(call[0]).replace(API_URL, "")}`;
const callsTo = (wanted: string) => fetchMock.mock.calls.filter((call) => key(call) === wanted);
const LIST = "GET /v1/me/verifications?role_slug=backend-engineer";
const ONE = `GET /v1/me/verifications/${ATTEMPT_ID}`;

beforeAll(() => {
  // jsdom has no modal dialog: open and close are the attribute that shows it
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  route.lang = "en";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
    const wanted = key([input, init]);
    const override = overrides.get(wanted);
    if (override) return override();
    if (wanted === "GET /v1/me") {
      return json({ data: { username: "fatou-sow", display_name: "Fatou Sow", roles: world.roles, technologies: [] } });
    }
    if (wanted === LIST) return json({ data: world.attempts, next_offset: null });
    if (wanted === ONE) return json({ data: world.attempts[0] });
    throw new Error(`no answer made up for ${wanted}`);
  });
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  overrides.clear();
  localStorage.clear();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

// the stage with this title, as a list item
const stage = (title: string) => screen.getByRole("heading", { level: 3, name: title }).closest("li")!;

test("while the page loads, it says so and shows no empty state", () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  render(<Verification lang="en" />);
  expect(screen.getByRole("status").textContent).toBe("Opening your verification");
  expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
});

test("without a role, the page asks for one first and sends the person to choose it", async () => {
  signedInWith([]);
  render(<Verification lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "Earn your Green Tick" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Choose your main role first" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Choose my role" }).getAttribute("href")).toBe("/en/onboarding?step=role");
  expect(callsTo(LIST)).toHaveLength(0);
});

test("a verified role says so, since when, and what it means", async () => {
  signedInWith([role({ verified_at: "2026-11-06T12:00:00Z" })]);
  render(<Verification lang="en" />);
  expect(await screen.findByRole("heading", { name: "Your role is verified" })).toBeTruthy();
  expect(screen.getByText("Verified since November 6, 2026.")).toBeTruthy();
  expect(screen.getByText(/Idea owners can now be shown your profile/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to the village" }).getAttribute("href")).toBe("/en/village");
  expect(screen.queryByRole("button", { name: "Start verification" })).toBeNull();
});

test("the lead names the main role, in the language of the page", async () => {
  signedInWith([role({ is_primary: false, slug: "frontend-engineer", name: "Frontend" }), role()]);
  route.lang = "fr";
  render(<Verification lang="fr" />);
  expect(await screen.findByText(/Votre rôle principal est Ingénieur backend et systèmes\./)).toBeTruthy();
});

test("with no attempt and attempts left, the person sees how it works and the start form", async () => {
  signedInWith([role({ verification: { attempts_used: 1, attempts_remaining: 2, latest_status: "failed" } })], [
    attempt({ status: "failed", current_phase: null, reviewer_notes: "Add tests before you try again." }),
  ]);
  render(<Verification lang="en" />);
  expect(await screen.findByRole("heading", { name: "What happens" })).toBeTruthy();
  expect(screen.getByText("Attempt 2 of 3")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Repositories" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: /I agree that an AI checker looks at these public repositories/ })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start verification" })).toBeTruthy();
  // the last attempt, its notes and the attempts left come first
  expect(screen.getByRole("heading", { name: "Your last attempt was not passed." })).toBeTruthy();
  expect(screen.getByText("You have 2 attempts left for this role.")).toBeTruthy();
});

test("earlier attempts show their outcome and the reviewer's notes", async () => {
  signedInWith(
    [role({ verification: { attempts_used: 2, attempts_remaining: 1, latest_status: "abandoned" } })],
    [
      attempt({ id: "b", attempt_number: 2, status: "abandoned", current_phase: null }),
      attempt({ id: "a", attempt_number: 1, status: "failed", current_phase: null, reviewer_notes: "Add tests before you try again." }),
    ],
  );
  render(<Verification lang="en" />);
  const earlier = (await screen.findByRole("heading", { name: "Earlier attempts" })).closest("section")!;
  const [second, first] = within(earlier).getAllByRole("listitem");
  expect(within(second).getByRole("heading", { name: "Attempt 2" })).toBeTruthy();
  expect(within(second).getByText("Stopped")).toBeTruthy();
  expect(within(first).getByText("Not passed")).toBeTruthy();
  expect(within(first).getByText("Reviewer's notes")).toBeTruthy();
  expect(within(first).getByText("Add tests before you try again.")).toBeTruthy();
  expect(within(first).getByText("Started November 10, 2026")).toBeTruthy();
  // the newest attempt was stopped, and one attempt is left
  expect(screen.getByRole("heading", { name: "Your last attempt ended before it was finished." })).toBeTruthy();
  expect(screen.getByText("You have 1 attempt left for this role.")).toBeTruthy();
});

test("with no attempts left, the page says so and only leads back to the village", async () => {
  signedInWith(
    [role({ verification: { attempts_used: 3, attempts_remaining: 0, latest_status: "failed" } })],
    [attempt({ status: "failed", current_phase: null })],
  );
  render(<Verification lang="en" />);
  expect(await screen.findByText("You have used all three attempts for this role.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to the village" }).getAttribute("href")).toBe("/en/village");
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Start verification" })).toBeNull();
});

test.each([
  ["pending", "codebase_analysis", "Repositories check", "Checking"],
  ["in_progress", "technical_defence", "Interview", "Your turn"],
  ["in_progress", "report_generation", "Interview", "Writing the report"],
  ["awaiting_review", null, "Peer review", "Waiting"],
])("a %s attempt in phase %s shows %s as the stage under way", async (status, phase, current, pill) => {
  signedInWith([role()], [attempt({ status, current_phase: phase })]);
  render(<Verification lang="en" />);
  await screen.findByRole("heading", { level: 3, name: current });
  const now = screen.getAllByRole("listitem").filter((item) => item.getAttribute("aria-current") === "step");
  // report_generation: the interview is done and the report is being written, so no stage is current
  const expected = phase === "report_generation" ? 0 : 1;
  expect(now).toHaveLength(expected);
  if (expected) expect(within(now[0]).getByRole("heading", { level: 3 }).textContent).toBe(current);
  expect(within(stage(current)).getByText(pill)).toBeTruthy();
});

test("while the AI checks the repositories, the stage says so and lists the repositories as links", async () => {
  signedInWith([role()], [attempt()]);
  render(<Verification lang="en" />);
  const first = (await screen.findByRole("heading", { level: 3, name: "Repositories check" })).closest("li")!;
  expect(within(first).getByText("Our AI checker is looking at your public repositories: file names, languages, tests and recent commit messages. This usually takes a few minutes.")).toBeTruthy();
  expect(within(stage("Interview")).getByText("Later")).toBeTruthy();
  expect(within(stage("Peer review")).getByText("Later")).toBeTruthy();
  const link = screen.getByRole("link", { name: /github\.com\/fatou-sow\/ledger-api/ });
  expect(link.getAttribute("href")).toBe("https://github.com/fatou-sow/ledger-api");
  expect(screen.getByText(/You can leave this page\./)).toBeTruthy();
  // no button to start the interview yet
  expect(screen.queryByRole("link", { name: "Start the interview" })).toBeNull();
});

test("a failed first check shows our own sentence, not the API's text", async () => {
  signedInWith([role()], [attempt({ last_error: "GitHub API rate limit exceeded", analysis_attempts: 1 })]);
  render(<Verification lang="en" />);
  expect(await screen.findByText("The first check did not finish. We are trying again.")).toBeTruthy();
  expect(screen.queryByText(/rate limit/)).toBeNull();
});

test("when the interview can start, one link opens it with the attempt id and warns first", async () => {
  signedInWith([role()], [attempt({ status: "in_progress", current_phase: "technical_defence" })]);
  render(<Verification lang="en" />);
  const start = await screen.findByRole("link", { name: "Start the interview" });
  expect(start.getAttribute("href")).toBe(`/en/verification/interview?id=${ATTEMPT_ID}`);
  expect(within(stage("Interview")).getByText(/Once you start, stay on the page: leaving ends the attempt\./)).toBeTruthy();
  expect(within(stage("Repositories check")).getByText("Done")).toBeTruthy();
});

test("once the answers are in, the report is being written and the review comes next", async () => {
  signedInWith([role()], [attempt({ status: "in_progress", current_phase: "report_generation" })]);
  render(<Verification lang="en" />);
  expect(await screen.findByText("Your answers are in. The report for your reviewer is being written.")).toBeTruthy();
  expect(within(stage("Peer review")).getByText("Later")).toBeTruthy();
});

test("awaiting review is waiting on a person, not on the AI", async () => {
  signedInWith([role()], [attempt({ status: "awaiting_review", current_phase: null })]);
  render(<Verification lang="fr" />);
  expect(await screen.findByText(/Un développeur vérifié dans ce rôle lira le rapport et décidera/)).toBeTruthy();
  expect(within(stage("Relecture par un pair")).getByText("En attente")).toBeTruthy();
  expect(within(stage("Entretien")).getByText("Fait")).toBeTruthy();
});

test.each([
  ["en", "fr", "This attempt is in French: the interview and the AI's report use French."],
  ["fr", "en", "Cette tentative est en anglais\u202f: l'entretien et le rapport de l'IA sont en anglais."],
] as const)("an attempt in another language than the %s page says so", async (lang, language, note) => {
  route.lang = lang;
  signedInWith([role()], [attempt({ language, status: "in_progress", current_phase: "technical_defence" })]);
  render(<Verification lang={lang} />);
  // the text matcher folds the no-break space, so the exact text is read from the node
  expect((await screen.findByText(/^(This attempt is in|Cette tentative est en)/)).textContent).toBe(note);
});

test.each(["en", "fr"] as const)("an attempt in the language of the %s page shows no language note", async (lang) => {
  route.lang = lang;
  signedInWith([role()], [attempt({ language: lang, status: "in_progress", current_phase: "technical_defence" })]);
  render(<Verification lang={lang} />);
  await screen.findByRole("heading", { level: 3, name: copy[lang].stages.interview.title });
  expect(screen.queryByText(copy[lang].otherLanguage)).toBeNull();
});

// the page asks again every five seconds, as the fake clock moves
async function pass(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

test("a pending attempt is refetched every 5 seconds", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signedInWith([role()], [attempt()]);
  render(<Verification lang="en" />);
  await screen.findByRole("heading", { level: 3, name: "Repositories check" });
  expect(callsTo(ONE)).toHaveLength(0);
  await pass(5000);
  expect(callsTo(ONE)).toHaveLength(1);
  await pass(5000);
  expect(callsTo(ONE)).toHaveLength(2);
});

test("an attempt awaiting review, or in the interview, is not polled", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signedInWith([role()], [attempt({ status: "awaiting_review", current_phase: null })]);
  render(<Verification lang="en" />);
  await screen.findByRole("heading", { level: 3, name: "Peer review" });
  await pass(20_000);
  expect(callsTo(ONE)).toHaveLength(0);
});

test("a hidden tab is not polled, and coming back refetches once", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signedInWith([role()], [attempt({ status: "awaiting_review", current_phase: null })]);
  render(<Verification lang="en" />);
  await screen.findByRole("heading", { level: 3, name: "Peer review" });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  document.dispatchEvent(new Event("visibilitychange"));
  await pass(20_000);
  expect(callsTo(ONE)).toHaveLength(0);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  document.dispatchEvent(new Event("visibilitychange"));
  await pass(0);
  expect(callsTo(ONE)).toHaveLength(1);
});

test("when the attempt is passed, the developer is fetched again and the verified state shows", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  signedInWith([role()], [attempt({ status: "pending" })]);
  render(<Verification lang="en" />);
  await screen.findByRole("heading", { level: 3, name: "Repositories check" });
  world.attempts = [attempt({ status: "passed", current_phase: null })];
  world.roles = [role({ verified_at: "2026-11-12T12:00:00Z" })];
  await pass(5000);
  expect(await screen.findByRole("heading", { name: "Your role is verified" })).toBeTruthy();
  expect(callsTo("GET /v1/me")).toHaveLength(2);
  await pass(20_000);
  expect(callsTo(ONE)).toHaveLength(1);
});

test("stopping an attempt asks first, and only the confirm button calls abandon", async () => {
  signedInWith([role()], [attempt({ status: "awaiting_review", current_phase: null })]);
  overrides.set(`POST /v1/me/verifications/${ATTEMPT_ID}/abandon`, () => {
    world.attempts = [attempt({ status: "abandoned", current_phase: null })];
    world.roles = [role({ verification: { attempts_used: 1, attempts_remaining: 2, latest_status: "abandoned" } })];
    return json({ data: world.attempts[0] });
  });
  render(<Verification lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop this attempt" }));
  expect(screen.getByRole("heading", { name: "Stop this attempt?" })).toBeTruthy();
  expect(screen.getByText("It ends now and counts as one of your three.")).toBeTruthy();
  expect(callsTo(`POST /v1/me/verifications/${ATTEMPT_ID}/abandon`)).toHaveLength(0);

  // keeping going closes the question and changes nothing
  fireEvent.click(screen.getByRole("button", { name: "Keep going" }));
  expect(screen.queryByRole("button", { name: "Stop the attempt" })).toBeNull();
  expect(callsTo(`POST /v1/me/verifications/${ATTEMPT_ID}/abandon`)).toHaveLength(0);

  fireEvent.click(screen.getByRole("button", { name: "Stop this attempt" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop the attempt" }));
  expect(await screen.findByRole("heading", { name: "Your last attempt ended before it was finished." })).toBeTruthy();
  expect(callsTo(`POST /v1/me/verifications/${ATTEMPT_ID}/abandon`)).toHaveLength(1);
  expect(screen.getByText("You have 2 attempts left for this role.")).toBeTruthy();
});

test("stopping an attempt that has already ended just refreshes the page", async () => {
  signedInWith([role()], [attempt({ status: "awaiting_review", current_phase: null })]);
  overrides.set(`POST /v1/me/verifications/${ATTEMPT_ID}/abandon`, () => {
    world.attempts = [attempt({ status: "failed", current_phase: null })];
    return refused(409, "VERIFICATION_NOT_ACTIVE");
  });
  render(<Verification lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop this attempt" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop the attempt" }));
  expect(await screen.findByRole("heading", { name: "Your last attempt was not passed." })).toBeTruthy();
  expect(callsTo(LIST)).toHaveLength(2);
});

test("a stop that fails says so inside the question and keeps the attempt", async () => {
  signedInWith([role()], [attempt({ status: "awaiting_review", current_phase: null })]);
  overrides.set(`POST /v1/me/verifications/${ATTEMPT_ID}/abandon`, () => json({}, 500));
  render(<Verification lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop this attempt" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop the attempt" }));
  expect((await screen.findByRole("alert")).textContent).toBe("We could not stop the attempt. Nothing was changed, so you can try again.");
  expect(screen.getByRole("heading", { level: 3, name: "Peer review" })).toBeTruthy();
});

test("the demo's refused stop says nothing was saved inside the question, not to try again", async () => {
  signedInWith([role()], [attempt({ status: "awaiting_review", current_phase: null })]);
  overrides.set(`POST /v1/me/verifications/${ATTEMPT_ID}/abandon`, () => refused(403, "DEMO_READ_ONLY"));
  render(<Verification lang="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop this attempt" }));
  fireEvent.click(screen.getByRole("button", { name: "Stop the attempt" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Nothing was saved. The demo cannot be changed.");
  expect(screen.getByRole("heading", { level: 3, name: "Peer review" })).toBeTruthy();
});

test.each([
  ["en", "We couldn't open your verification", "Try again"],
  ["fr", "Nous n'avons pas pu ouvrir votre vérification", "Réessayer"],
])("the error screen explains what happened and retries in %s", (lang, title, retry) => {
  route.lang = lang;
  const onRetry = vi.fn();
  render(<VerificationError retry={onRetry} />);
  expect(screen.getByRole("heading", { level: 1, name: title })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: retry }));
  expect(onRetry).toHaveBeenCalledOnce();
});

// ---------- the start form ----------

const REPOS = "https://github.com/ama-mensah/ledger-api";

async function openForm() {
  signedInWith([role()]);
  render(<Verification lang="en" />);
  return screen.findByRole("textbox", { name: "Repositories" });
}

function submitWith(text: string, agree = true) {
  fireEvent.change(screen.getByRole("textbox", { name: "Repositories" }), { target: { value: text } });
  const box = screen.getByRole("checkbox") as HTMLInputElement;
  if (box.checked !== agree) fireEvent.click(box);
  fireEvent.click(screen.getByRole("button", { name: "Start verification" }));
}

const START = "POST /v1/me/verifications/backend-engineer";

test.each([
  ["", "Add at least one repository address."],
  ["  \n\n ", "Add at least one repository address."],
  ["https://gitlab.com/ama/ledger", "Line 1 is not a GitHub repository address. Write it like https://github.com/your-name/your-project."],
  [`${REPOS}\nhttps://github.com/ama-mensah`, "Line 2 is not a GitHub repository address. Write it like https://github.com/your-name/your-project."],
  [`${REPOS}\nhttps://github.com/ama-mensah/ledger-api/tree/main`, "Line 2 is not a GitHub repository address. Write it like https://github.com/your-name/your-project."],
  [`${REPOS}\n\n${REPOS}/`, "Line 3 repeats an address from a line above. List each repository once."],
  [Array.from({ length: 11 }, (_, i) => `https://github.com/ama/repo-${i}`).join("\n"), "Add 10 repositories at most. You added 11."],
])("the form refuses %j and says what to fix", async (text, message) => {
  const field = await openForm();
  submitWith(text);
  expect((await screen.findByRole("alert")).textContent).toBe(message);
  expect(field.getAttribute("aria-invalid")).toBe("true");
  expect(field.getAttribute("aria-describedby")).toContain("verify-error");
  expect(callsTo(START)).toHaveLength(0);
});

test("an unticked consent box is refused, and the error goes once it is ticked", async () => {
  await openForm();
  submitWith(REPOS, false);
  const box = screen.getByRole("checkbox");
  expect((await screen.findByRole("alert")).textContent).toBe("Tick the box to agree before you start.");
  expect(box.getAttribute("aria-invalid")).toBe("true");
  expect(callsTo(START)).toHaveLength(0);
  fireEvent.click(box);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("an error on the repositories goes as soon as the text is right", async () => {
  const field = await openForm();
  submitWith("not an address");
  await screen.findByRole("alert");
  fireEvent.change(field, { target: { value: REPOS } });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(field.getAttribute("aria-invalid")).toBe("false");
});

test("a valid form sends the cleaned list, then shows the attempt under way", async () => {
  await openForm();
  const started = attempt({ attempt_number: 1, evidence: [{ repository_url: REPOS }, { repository_url: "https://github.com/ama-mensah/ui" }] });
  overrides.set(START, () => {
    world.attempts = [started];
    return json({ data: started }, 201);
  });
  submitWith(`  ${REPOS}/  \n\n https://github.com/ama-mensah/ui `);
  expect(await screen.findByRole("heading", { level: 3, name: "Repositories check" })).toBeTruthy();
  const [, init] = callsTo(START)[0];
  expect(JSON.parse((init as RequestInit).body as string)).toEqual({ repositories: [REPOS, "https://github.com/ama-mensah/ui"], language: "en" });
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("the form says which language the interview and report will use, before the button", async () => {
  await openForm();
  expect(screen.getByText(copy.en.form.language)).toBeTruthy();
  expect(screen.getByRole("checkbox").getAttribute("aria-describedby")).toContain("verify-language");
  cleanup();
  route.lang = "fr";
  signedInWith([role()]);
  render(<Verification lang="fr" />);
  expect(await screen.findByText(copy.fr.form.language)).toBeTruthy();
  expect(copy.fr.form.language).toMatch(/seront en français, la langue de cette page/);
});

test.each([
  ["en", "Start verification", "en"],
  ["fr", "Lancer la vérification", "fr"],
] as const)("starting on the %s page sends language %s", async (lang, button, sent) => {
  route.lang = lang;
  signedInWith([role()]);
  render(<Verification lang={lang} />);
  await screen.findByRole("textbox");
  const started = attempt({ language: sent });
  overrides.set(START, () => {
    world.attempts = [started];
    return json({ data: started }, 201);
  });
  fireEvent.change(screen.getByRole("textbox"), { target: { value: REPOS } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: button }));
  await waitFor(() => expect(callsTo(START)).toHaveLength(1));
  const [, init] = callsTo(START)[0];
  expect(JSON.parse((init as RequestInit).body as string).language).toBe(sent);
});

test("while sending, the label stays, the button is busy and a second press is ignored", async () => {
  await openForm();
  let finish!: (response: Response) => void;
  overrides.set(START, () => new Promise<Response>((resolve) => (finish = resolve)));
  submitWith(REPOS);
  const button = screen.getByRole("button", { name: "Start verification" });
  await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("true"));
  fireEvent.click(button);
  expect(callsTo(START)).toHaveLength(1);
  const started = attempt();
  world.attempts = [started];
  finish(json({ data: started }, 201));
  await screen.findByRole("heading", { level: 3, name: "Repositories check" });
});

test.each([["VERIFICATION_IN_PROGRESS"], ["VERIFICATION_CONFLICT"]])("a %s answer fetches the attempts again", async (code) => {
  await openForm();
  overrides.set(START, () => {
    // another tab started it first
    world.attempts = [attempt()];
    return refused(409, code);
  });
  submitWith(REPOS);
  expect(await screen.findByRole("heading", { level: 3, name: "Repositories check" })).toBeTruthy();
  expect(callsTo(LIST)).toHaveLength(2);
});

test.each([["ROLE_ALREADY_VERIFIED"], ["VERIFICATION_ATTEMPTS_EXHAUSTED"]])("a %s answer fetches the developer again", async (code) => {
  await openForm();
  overrides.set(START, () => {
    world.roles = [role({ verified_at: "2026-11-12T12:00:00Z" })];
    return refused(409, code);
  });
  submitWith(REPOS);
  expect(await screen.findByRole("heading", { name: "Your role is verified" })).toBeTruthy();
  expect(callsTo("GET /v1/me")).toHaveLength(2);
});

test("a 422 puts an error under the repositories field", async () => {
  await openForm();
  overrides.set(START, () => json({ detail: [] }, 422));
  submitWith(REPOS);
  expect((await screen.findByRole("alert")).textContent).toBe("Check the repository addresses and try again.");
  expect(screen.getByRole("textbox", { name: "Repositories" }).getAttribute("aria-invalid")).toBe("true");
});

test.each([
  ["a server error", () => json({}, 500), "Something went wrong on our side, so the verification did not start. Your addresses are still here, so you can try again."],
  ["a dropped connection", () => Promise.reject(new TypeError("Failed to fetch")), "We could not reach Village Sqwhere, so the verification did not start. Your addresses are still here. Check your connection and try again."],
])("%s keeps the typed text and says nothing was lost", async (_name, answer, message) => {
  const field = (await openForm()) as HTMLTextAreaElement;
  overrides.set(START, answer);
  submitWith(REPOS);
  expect((await screen.findByRole("alert")).textContent).toBe(message);
  expect(field.value).toBe(REPOS);
  expect(screen.getByRole("button", { name: "Start verification" }).getAttribute("aria-busy")).toBe("false");
});

test("the demo's refused start says nothing was saved, not that something went wrong, and keeps the typed text", async () => {
  const field = (await openForm()) as HTMLTextAreaElement;
  overrides.set(START, () => refused(403, "DEMO_READ_ONLY"));
  submitWith(REPOS);
  expect((await screen.findByRole("alert")).textContent).toBe("Nothing was saved. The demo cannot be changed.");
  expect(screen.queryByText(/the verification did not start/)).toBeNull();
  expect(field.value).toBe(REPOS);
});

// ---------- the copy ----------

// every string in a value, however deeply it is nested
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const shape = (value: unknown): unknown =>
  value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([name, inner]) => [name, shape(inner)]))
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
