import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { forgetMe } from "../session/me";
import { SESSION_KEY } from "../session/session";
import { ProfilePage } from "./profile-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ lang: "en" }),
}));

const fetchMock = vi.fn();
const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status });
const refusal = (status: number, code: string) => reply(status, { detail: { code, message: "English text from the API" } });

// a made-up developer
const me = { username: "kwabena-owusu", display_name: "Kwabena Owusu", bio: null, country_code: null, roles: [], technologies: [], sectors: [] };

const deletions = () =>
  fetchMock.mock.calls
    .filter(([url, init]) => init?.method === "POST" && String(url).endsWith("/v1/me/deletion"))
    .map(([, init]) => JSON.parse(init.body));

async function page(answer: Response = reply(204), lang: "en" | "fr" = "en") {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).endsWith("/v1/me/deletion")) return Promise.resolve(answer.clone());
    if (String(url).endsWith("/v1/auth/logout")) return Promise.resolve(reply(204));
    return Promise.resolve(init?.method ? reply(500) : reply(200, { data: me }));
  });
  render(<ProfilePage lang={lang} />);
  await screen.findByRole("heading", { level: 1 });
}

const dialog = () => screen.getByRole("dialog", { name: "Delete your account for good?" });
const confirmButton = () => within(dialog()).getByRole("button", { name: "Delete my account" });
const usernameField = () => within(dialog()).getByRole("textbox", { name: "Type your username to confirm" });
const understood = () => within(dialog()).getByRole("checkbox");

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { replace: vi.fn() });
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  cleanup();
  forgetMe();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

test("the profile ends with a way to delete the account, which opens a dialog saying what goes and what stays", async () => {
  await page();
  expect(screen.getByRole("heading", { level: 2, name: "Delete your account" })).toBeTruthy();
  openDialog();
  expect(within(dialog()).getByText(/Your open ideas are closed/)).toBeTruthy();
  expect(within(dialog()).getByText(/shown under "Deleted account"/)).toBeTruthy();
  expect(within(dialog()).getByText("Your username is kwabena-owusu.")).toBeTruthy();
  expect(usernameField().getAttribute("autocomplete")).toBe("off");
  expect(deletions()).toEqual([]);
});

test("nothing is sent until the box is ticked and the username typed, whatever is pressed", async () => {
  await page();
  openDialog();
  expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(confirmButton());
  fireEvent.submit(usernameField().closest("form")!);

  // the username alone is not enough
  fireEvent.change(usernameField(), { target: { value: "kwabena-owusu" } });
  fireEvent.click(confirmButton());
  // nor the box with a wrong username
  fireEvent.change(usernameField(), { target: { value: "kwabena-owus" } });
  fireEvent.click(understood());
  fireEvent.click(confirmButton());
  fireEvent.submit(usernameField().closest("form")!);
  expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
  expect(deletions()).toEqual([]);
});

test("closing the dialog clears both checks, so reopening starts again", async () => {
  await page();
  openDialog();
  fireEvent.click(understood());
  fireEvent.change(usernameField(), { target: { value: "kwabena-owusu" } });
  fireEvent.click(within(dialog()).getByRole("button", { name: "Keep my account" }));
  openDialog();
  expect((understood() as HTMLInputElement).checked).toBe(false);
  expect((usernameField() as HTMLInputElement).value).toBe("");
  expect(confirmButton().getAttribute("aria-disabled")).toBe("true");
  expect(deletions()).toEqual([]);
});

test("with both checks done, the account is deleted once, then the person is signed out to a goodbye page", async () => {
  await page();
  openDialog();
  fireEvent.click(understood());
  // capital letters and spaces around do not matter, as for the API
  fireEvent.change(usernameField(), { target: { value: "  Kwabena-Owusu " } });
  expect(confirmButton().getAttribute("aria-disabled")).toBeNull();
  fireEvent.click(confirmButton());
  fireEvent.click(confirmButton());
  await waitFor(() => expect(window.location.replace).toHaveBeenCalledWith("/en/goodbye"));
  expect(deletions()).toEqual([{ username: "Kwabena-Owusu" }]);
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
});

test("an owner of a hub with a team is told why, with a way to their hubs, and stays signed in", async () => {
  await page(refusal(409, "OWNS_HUB_WITH_TEAM"));
  openDialog();
  fireEvent.click(understood());
  fireEvent.change(usernameField(), { target: { value: "kwabena-owusu" } });
  fireEvent.click(confirmButton());
  expect((await within(dialog()).findByRole("alert")).textContent).toMatch(/You own a hub that other members are still in/);
  expect(within(dialog()).getByRole("link", { name: "Go to your hubs" }).getAttribute("href")).toBe("/en/hubs");
  expect(window.location.replace).not.toHaveBeenCalled();
  expect(localStorage.getItem(SESSION_KEY)).not.toBeNull();
});

test("a username the API does not accept is a field error", async () => {
  await page(refusal(422, "CONFIRMATION_MISMATCH"));
  openDialog();
  fireEvent.click(understood());
  fireEvent.change(usernameField(), { target: { value: "kwabena-owusu" } });
  fireEvent.click(confirmButton());
  expect(await within(dialog()).findByText("That is not your username. Type it exactly as shown.")).toBeTruthy();
  expect(usernameField().getAttribute("aria-invalid")).toBe("true");
});

test("a failed deletion says nothing changed and keeps the person signed in", async () => {
  await page(reply(500));
  openDialog();
  fireEvent.click(understood());
  fireEvent.change(usernameField(), { target: { value: "kwabena-owusu" } });
  fireEvent.click(confirmButton());
  expect(await within(dialog()).findByText("We couldn't delete your account. Nothing changed, so try again.")).toBeTruthy();
  expect(window.location.replace).not.toHaveBeenCalled();
});

test("deleting the account speaks French", async () => {
  await page(reply(204), "fr");
  expect(screen.getByRole("heading", { level: 2, name: "Supprimer votre compte" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Supprimer mon compte" }));
  expect(screen.getByRole("dialog", { name: "Supprimer votre compte pour de bon ?" })).toBeTruthy();
});
