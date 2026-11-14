import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { DoneStep } from "./done-step";
import { NO_ANSWERS } from "./steps";

const fetchMock = vi.fn();
const reply = (status: number) => new Response("{}", { status });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(reply(200));
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

const answers = { ...NO_ANSWERS, role: "frontend-engineer", stack: ["react"] };

function card(lang: "en" | "fr", profile: { displayName: string | null; username: string }) {
  render(<DoneStep lang={lang} answers={answers} profile={profile} onChange={() => {}} />);
}

test("the card shows the real name, with the GitHub username as a link under it", () => {
  card("en", { displayName: "Kofi Mensah", username: "kofi-ships" });
  expect(screen.getByText("Kofi Mensah")).toBeTruthy();
  const link = screen.getByRole("link", { name: "@kofi-ships (GitHub profile, opens in a new tab)" });
  expect(link.getAttribute("href")).toBe("https://github.com/kofi-ships");
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
});

test("without a real name, the username is the name, shown once and linked", () => {
  card("en", { displayName: null, username: "kofi-ships" });
  expect(screen.getByRole("heading", { level: 1, name: "You're in, kofi-ships." })).toBeTruthy();
  const link = screen.getByRole("link", { name: "kofi-ships (GitHub profile, opens in a new tab)" });
  expect(link.getAttribute("href")).toBe("https://github.com/kofi-ships");
  expect(screen.queryByText(/@kofi-ships/)).toBeNull();
});

test("the link says it opens a new tab in French", () => {
  card("fr", { displayName: "Kofi Mensah", username: "kofi-ships" });
  expect(
    screen.getByRole("link", { name: "@kofi-ships (profil GitHub, s'ouvre dans un nouvel onglet)" }),
  ).toBeTruthy();
});

test("the French card shows technologies in French", () => {
  const stack = ["react", "computer-vision", "llms", "vector-databases"];
  render(
    <DoneStep
      lang="fr"
      answers={{ ...answers, stack }}
      profile={{ displayName: "Kofi Mensah", username: "kofi-ships" }}
      onChange={() => {}}
    />,
  );
  const tags = screen.getAllByRole("listitem").slice(0, stack.length);
  expect(tags.map((tag) => tag.textContent)).toEqual([
    "React",
    "LLM",
    "Vision par ordinateur",
    "Bases de données vectorielles",
  ]);
});

test("the card says what is saved: role, stack, sectors and feed, plus the country only when one was chosen", async () => {
  card("en", { displayName: "Kofi Mensah", username: "kofi-ships" });
  expect(screen.getByText("Saving your answers")).toBeTruthy();
  expect(await screen.findByText("Your role, stack, sectors and what your feed shows are saved.")).toBeTruthy();
  // the role, the stack, the feed's technologies, the sectors
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("a chosen country is saved with the rest, and the card says so in both languages", async () => {
  const chosen = { ...answers, country: "SEN" };
  render(<DoneStep lang="en" answers={chosen} profile={{ displayName: "Kofi Mensah", username: "kofi-ships" }} onChange={() => {}} />);
  expect(await screen.findByText("Your role, stack, sectors, country and what your feed shows are saved.")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(5);
  const [, patch] = fetchMock.mock.calls[4];
  expect([patch.method, patch.body]).toEqual(["PATCH", '{"country_code":"SN"}']);

  cleanup();
  render(<DoneStep lang="fr" answers={chosen} profile={{ displayName: "Kofi Mensah", username: "kofi-ships" }} onChange={() => {}} />);
  expect(
    await screen.findByText("Votre rôle, vos technologies, vos domaines, votre pays et le contenu de votre fil sont enregistrés."),
  ).toBeTruthy();
});

test("the saved message is in French too", async () => {
  card("fr", { displayName: "Kofi Mensah", username: "kofi-ships" });
  expect(
    await screen.findByText("Votre rôle, vos technologies, vos domaines et le contenu de votre fil sont enregistrés."),
  ).toBeTruthy();
});

test("a failed save shows an alert and Try again sends it all again", async () => {
  fetchMock.mockResolvedValueOnce(reply(500));
  card("en", { displayName: "Kofi Mensah", username: "kofi-ships" });
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("We couldn't save your answers. They are still here, so try again.");

  fetchMock.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText(/^Your role, stack, sectors and what your feed shows are saved/)).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

test("with no role chosen nothing is saved and no save message shows", () => {
  render(
    <DoneStep lang="en" answers={NO_ANSWERS} profile={{ displayName: "Kofi Mensah", username: "kofi-ships" }} onChange={() => {}} />,
  );
  expect(screen.queryByText(/Saving your answers/)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("the way to the village opens once the role is saved", async () => {
  card("fr", { displayName: "Kofi Mensah", username: "kofi-ships" });
  expect(screen.getByRole("button", { name: "Aller au village" }).getAttribute("aria-disabled")).toBe("true");
  const link = await screen.findByRole("link", { name: "Aller au village" });
  expect(link.getAttribute("href")).toBe("/fr/village");
});

test("someone who skipped can go straight to the village", () => {
  render(<DoneStep lang="en" answers={NO_ANSWERS} profile={{ displayName: null, username: "kofi-ships" }} onChange={() => {}} />);
  expect(screen.getByRole("link", { name: "Go to the village" }).getAttribute("href")).toBe("/en/village");
});
