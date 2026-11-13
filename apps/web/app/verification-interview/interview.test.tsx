import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import InterviewError from "../[lang]/verification/interview/error";
import { forgetMe, keepMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { copy } from "./copy";
import { Interview } from "./interview";

const route = vi.hoisted(() => ({ lang: "en", search: "id=00000000-0000-4000-9000-000000000007" }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ lang: route.lang }),
  useSearchParams: () => new URLSearchParams(route.search),
}));

// A WebSocket the test drives by hand: it records what was sent and what was opened.
class FakeSocket {
  static all: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  say(frame: object) {
    act(() => this.onmessage?.({ data: JSON.stringify(frame) }));
  }
  drop() {
    act(() => this.onclose?.());
  }
}

const fetchMock = vi.fn();
const scrollIntoView = vi.fn();
// what matchMedia answers: the header's theme switch also listens to it
const media = (matches: boolean) => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() });

const attempt = (status: string, current_phase: string | null) =>
  new Response(JSON.stringify({ data: { status, current_phase } }), { status: 200 });

const ready = () => attempt("in_progress", "technical_defence");

const welcome = { type: "assistant_message", kind: "welcome", text: "Welcome, Fatou. Five questions follow." };
const question = (sequence: number, text = `Question text ${sequence}`) => ({
  type: "question",
  turn_id: `turn-${sequence}`,
  sequence,
  text,
});

beforeEach(() => {
  // the frame already knows who is signed in, as it does after the first screen of a visit
  keepMe({ username: "aminata-n", display_name: "Aminata Ndiaye", bio: null, roles: [], technologies: [], feed_topics: [] });
  route.lang = "en";
  route.search = "id=00000000-0000-4000-9000-000000000007";
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media(false)));
  Element.prototype.scrollIntoView = scrollIntoView;
  // jsdom has no modal dialogs
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      access_token: "token-abc",
      refresh_token: "r",
      expires_at: "2099-01-01T00:00:00Z",
      refresh_expires_at: "2099-01-01T00:00:00Z",
    }),
  );
});

afterEach(() => {
  cleanup();
  forgetMe();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  scrollIntoView.mockReset();
  localStorage.clear();
});

async function intro() {
  fetchMock.mockResolvedValue(ready());
  render(<Interview lang="en" />);
  return screen.findByRole("button", { name: "Begin the interview" });
}

// the interview, begun and asking its first question
async function begun() {
  fireEvent.click(await intro());
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  const socket = FakeSocket.all[0];
  socket.say(welcome);
  socket.say(question(1));
  return socket;
}

const field = () => screen.getByRole("textbox", { name: "Your answer" }) as HTMLTextAreaElement;

function answer(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
}

test("the intro warns about leaving and opens no socket until Begin is pressed", async () => {
  await intro();
  expect(screen.getByRole("heading", { level: 1, name: "Interview for your Green Tick" })).toBeTruthy();
  expect(screen.getByText("Stay on this page until the end")).toBeTruthy();
  expect(screen.getByText(/this attempt ends and counts as one of your three/)).toBeTruthy();
  expect(screen.getByText("There is no timer, so take the time each answer needs.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Not now" }).getAttribute("href")).toBe("/en/verification");
  expect(FakeSocket.all).toHaveLength(0);
  expect(fetchMock.mock.calls[0][0]).toContain("/v1/me/verifications/00000000-0000-4000-9000-000000000007");
});

test("while the attempt loads, the page says so and offers no begin button", () => {
  fetchMock.mockReturnValue(new Promise(() => {}));
  render(<Interview lang="en" />);
  expect(screen.getByRole("status").textContent).toBe("Opening your interview");
  expect(screen.queryByRole("button", { name: "Begin the interview" })).toBeNull();
});

test("Begin opens a socket carrying the attempt id and the token", async () => {
  fireEvent.click(await intro());
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  const url = new URL(FakeSocket.all[0].url);
  expect(FakeSocket.all[0].url.startsWith("ws://")).toBe(true);
  expect(url.pathname).toBe("/v1/me/verifications/00000000-0000-4000-9000-000000000007/interview");
  expect(url.searchParams.get("token")).toBe("token-abc");
  expect(screen.getByText("Connecting to the interviewer")).toBeTruthy();
});

test("the welcome and the first question appear, the question with its number", async () => {
  await begun();
  const log = screen.getByRole("log");
  expect(log.getAttribute("aria-live")).toBe("polite");
  expect(within(log).getByText("Welcome, Fatou. Five questions follow.")).toBeTruthy();
  expect(within(log).getByText("Question text 1")).toBeTruthy();
  expect(within(log).getByText("Question 1")).toBeTruthy();
  expect(within(log).getAllByText("Interviewer")).toHaveLength(2);
  await waitFor(() => expect(document.activeElement).toBe(field()));
  expect(scrollIntoView).toHaveBeenCalled();
});

test("sending puts the answer in the transcript, sends it, and waits for the interviewer", async () => {
  const socket = await begun();
  answer("  I use one transaction.\nIt rolls back.  ");
  expect(JSON.parse(socket.sent[0])).toEqual({ type: "answer", text: "I use one transaction.\nIt rolls back." });
  const log = screen.getByRole("log");
  expect(within(log).getByText("You")).toBeTruthy();
  expect(within(log).getByText(/I use one transaction/)).toBeTruthy();
  expect(field().value).toBe("");
  expect(field().disabled).toBe(true);
  expect(within(log).getByText("The interviewer is reading your answer")).toBeTruthy();
});

test("the next question enables the field again and moves focus to it", async () => {
  const socket = await begun();
  answer("My answer");
  socket.say({ type: "answer_saved", turn_id: "turn-1" });
  socket.say({ type: "assistant_message", kind: "acknowledgement", text: "Thank you." });
  expect(field().disabled).toBe(true);
  socket.say(question(2));
  expect(screen.getByText("Question 2")).toBeTruthy();
  expect(screen.queryByText("The interviewer is reading your answer")).toBeNull();
  expect(field().disabled).toBe(false);
  await waitFor(() => expect(document.activeElement).toBe(field()));
});

test("Ctrl and Enter sends, and Enter alone does not", async () => {
  const socket = await begun();
  fireEvent.change(field(), { target: { value: "First line" } });
  fireEvent.keyDown(field(), { key: "Enter" });
  expect(socket.sent).toHaveLength(0);
  fireEvent.keyDown(field(), { key: "Enter", ctrlKey: true });
  expect(socket.sent).toHaveLength(1);
  expect(JSON.parse(socket.sent[0]).text).toBe("First line");
});

test("an empty answer is not sent", async () => {
  const socket = await begun();
  answer("   ");
  expect(socket.sent).toHaveLength(0);
  expect(screen.getByText("Write your answer before sending it.")).toBeTruthy();
  expect(field().getAttribute("aria-invalid")).toBe("true");
});

test("the counter shows only past 9,000 characters", async () => {
  await begun();
  expect(screen.queryByText(/of 10,000 characters/)).toBeNull();
  fireEvent.change(field(), { target: { value: "a".repeat(9001) } });
  expect(screen.getByText("9,001 of 10,000 characters")).toBeTruthy();
});

test("a refused answer comes back with a field error, and the person can try again", async () => {
  const socket = await begun();
  answer("My long answer");
  socket.say({ type: "error", code: "ANSWER_TOO_LONG" });
  expect(field().value).toBe("My long answer");
  expect(field().disabled).toBe(false);
  expect(screen.getByText("Your answer is over 10,000 characters. Shorten it, then send it again.")).toBeTruthy();
  expect(field().getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(field(), { target: { value: "Shorter" } });
  expect(screen.queryByText(/Shorten it/)).toBeNull();
});

test("any other error asks for the answer to be sent again", async () => {
  const socket = await begun();
  answer("My answer");
  socket.say({ type: "error", code: "INVALID_MESSAGE", message: "Bad" });
  expect(field().value).toBe("My answer");
  expect(screen.getByText("That did not go through. Send your answer again.")).toBeTruthy();
});

test("the finished view keeps the transcript and links back to the verification", async () => {
  const socket = await begun();
  answer("My last answer");
  socket.say({ type: "answer_saved", turn_id: "turn-1" });
  socket.say({ type: "assistant_message", kind: "closing", text: "That is all." });
  socket.say({ type: "interview_complete", status: "processing" });
  expect(screen.getByText("Your answers are saved")).toBeTruthy();
  expect(screen.getByText("The report for your reviewer is being written, then a verified peer decides.")).toBeTruthy();
  expect(screen.getByText("My last answer")).toBeTruthy();
  expect(screen.getByText("That is all.")).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("link", { name: "Back to your verification" }).getAttribute("href")).toBe("/en/verification");
  // the server closing after the last frame is not a dropped connection
  socket.drop();
  expect(screen.queryByText("The connection dropped")).toBeNull();
});

test("a close without completion says the attempt has ended", async () => {
  const socket = await begun();
  socket.drop();
  expect(screen.getByRole("alert").textContent).toContain("The connection dropped");
  expect(screen.getByText(/Your earlier answers were kept with it/)).toBeTruthy();
  expect(screen.getByText("Question text 1")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to your verification" })).toBeTruthy();
  expect(FakeSocket.all).toHaveLength(1);
});

test("a socket error ends the attempt the same way", async () => {
  const socket = await begun();
  act(() => socket.onerror?.());
  expect(screen.getByText("The connection dropped")).toBeTruthy();
  expect(socket.closed).toBe(true);
});

test("a refused connection says the interview could not start", async () => {
  fireEvent.click(await intro());
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  FakeSocket.all[0].drop();
  expect(screen.getByText("We couldn't start the interview")).toBeTruthy();
  expect(screen.getByText("It may already have been taken or ended.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to your verification" })).toBeTruthy();
});

test("leaving asks first, then sends abandon and says the attempt has ended", async () => {
  const socket = await begun();
  fireEvent.click(screen.getByRole("button", { name: "Leave the interview" }));
  const dialog = screen.getByRole("dialog", { name: "Leave the interview?" });
  expect(within(dialog).getByText("This attempt ends now and counts as one of your three.")).toBeTruthy();
  expect(socket.sent).toHaveLength(0);

  fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
  expect(socket.sent).toHaveLength(0);
  expect(screen.getByRole("textbox")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Leave the interview" }));
  fireEvent.click(screen.getByRole("button", { name: "Leave and end the attempt" }));
  expect(JSON.parse(socket.sent[0])).toEqual({ type: "abandon" });
  socket.say({ type: "interview_incomplete" });
  expect(screen.getByText("You left the interview")).toBeTruthy();
  expect(screen.getByText("This attempt has ended.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Leave the interview" })).toBeNull();
});

test("the browser warns before unloading only while the interview is live", async () => {
  const warned = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  await intro();
  expect(warned()).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Begin the interview" }));
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  expect(warned()).toBe(true);
  FakeSocket.all[0].say(question(1));
  FakeSocket.all[0].say({ type: "interview_complete", status: "processing" });
  expect(warned()).toBe(false);
});

// A tap on the logo or on "Sign out" would end the attempt with no question asked.
test("while the interview is live, the header offers no way out", async () => {
  const begin = await intro();
  expect(screen.getByRole("link", { name: "Village Sqwhere" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Français" })).toBeTruthy();

  fireEvent.click(begin);
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  const socket = FakeSocket.all[0];
  socket.say(question(1));
  expect(screen.queryByRole("link", { name: "Village Sqwhere" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Français" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  expect(screen.getByText("Village Sqwhere")).toBeTruthy();

  socket.say({ type: "interview_complete", status: "processing" });
  expect(screen.getByRole("link", { name: "Village Sqwhere" })).toBeTruthy();
});

test("the socket closes when the page goes away", async () => {
  const socket = await begun();
  cleanup();
  expect(socket.closed).toBe(true);
});

test("the newest message scrolls without gliding when motion is reduced", async () => {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media(true)));
  await begun();
  expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "end", behavior: "instant" });
});

test.each([
  ["checking", attempt("in_progress", "codebase_analysis"), "Your repositories are still being checked"],
  ["a pending one", attempt("pending", null), "Your repositories are still being checked"],
  ["answered", attempt("in_progress", "report_generation"), "You have already answered"],
  ["in review", attempt("awaiting_review", null), "A verified peer is reviewing this attempt"],
  ["ended", attempt("abandoned", null), "This attempt has ended"],
  ["failed", attempt("failed", null), "This attempt has ended"],
])("an attempt that is %s shows why and no begin button", async (_name, response, title) => {
  fetchMock.mockResolvedValue(response);
  render(<Interview lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Begin the interview" })).toBeNull();
  expect(screen.getByRole("link", { name: "Back to your verification" }).getAttribute("href")).toBe("/en/verification");
  expect(FakeSocket.all).toHaveLength(0);
});

test.each([
  ["an unknown attempt", () => fetchMock.mockResolvedValue(new Response("{}", { status: 404 })), "id=00000000-0000-4000-9000-000000000099"],
  ["an id that is not a UUID", () => fetchMock.mockResolvedValue(new Response("{}", { status: 422 })), "id=nonsense"],
  ["no id", () => fetchMock.mockResolvedValue(ready()), ""],
])("%s says the interview was not found", async (_name, reply, search) => {
  route.search = search;
  reply();
  render(<Interview lang="en" />);
  expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this interview" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to your verification" })).toBeTruthy();
});

test("the screen works in French, and its header links to the verification page", async () => {
  route.lang = "fr";
  fetchMock.mockResolvedValue(ready());
  render(<Interview lang="fr" />);
  const begin = await screen.findByRole("button", { name: "Commencer l'entretien" });
  expect(screen.getByRole("link", { name: "English" }).getAttribute("href")).toBe("/en/verification");
  fireEvent.click(begin);
  await waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  FakeSocket.all[0].say(question(1));
  expect(screen.getByText("Intervieweur")).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Votre réponse" })).toBeTruthy();
});

test.each([
  ["en", "We couldn't open your interview", "Try again"],
  ["fr", "Nous n'avons pas pu ouvrir votre entretien", "Réessayer"],
])("the error screen explains what happened and retries in %s", (lang, title, retry) => {
  route.lang = lang;
  const onRetry = vi.fn();
  render(<InterviewError retry={onRetry} />);
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
