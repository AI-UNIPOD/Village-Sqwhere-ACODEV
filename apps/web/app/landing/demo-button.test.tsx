import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { resetDemo } from "../session/demo";
import { SESSION_KEY } from "../session/session";
import { DemoButton, DemoNote } from "./demo-button";

const fetchMock = vi.fn();
const replace = vi.fn();
const tokens = {
  access_token: "demo-access",
  refresh_token: "demo-refresh",
  expires_in: 900,
  refresh_expires_at: "2099-01-01T00:00:00Z",
};
const answer = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

// the hero's pair: the button and the line under it
const pair = (lang: "en" | "fr" = "en") =>
  render(
    <>
      <DemoButton lang={lang} className="demo" note="demo-note">
        Try the demo
      </DemoButton>
      <p id="demo-note">
        <DemoNote lang={lang} />
      </p>
    </>,
  );
const note = () => document.getElementById("demo-note")!.textContent;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { replace });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  replace.mockReset();
  localStorage.clear();
  resetDemo();
});

test("the line under the button says what the demo is", () => {
  pair();
  expect(note()).toBe("No sign-up. Made-up people and ideas, and nothing can be changed. A short tour is inside.");
  expect(screen.getByRole("button", { name: "Try the demo" }).getAttribute("aria-describedby")).toBe("demo-note");
});

test("pressing it signs in as the demo account, keeps the session and opens the village", async () => {
  fetchMock.mockImplementation(() => answer(200, { data: { ...tokens, user: { is_demo: true } } }));
  pair("fr");
  fireEvent.click(screen.getByRole("button", { name: "Try the demo" }));
  expect(note()).toBe("Ouverture de la démo");

  await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/fr/village"));
  const [url, init] = fetchMock.mock.calls[0];
  expect(String(url)).toMatch(/\/v1\/auth\/demo$/);
  expect(init.method).toBe("POST");
  expect(init.body).toBeUndefined();
  expect(JSON.parse(localStorage.getItem(SESSION_KEY)!).access_token).toBe("demo-access");
});

test("a second press while it opens sends nothing more", async () => {
  let finish: (response: Response) => void = () => {};
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (finish = resolve)));
  pair();
  const button = screen.getByRole("button", { name: "Try the demo" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
  expect(button.getAttribute("aria-busy")).toBe("true");

  finish(new Response(JSON.stringify({ data: tokens }), { status: 200 }));
  await waitFor(() => expect(replace).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledOnce();
});

test.each([
  ["a server with the demo switched off", () => answer(404, { detail: { code: "DEMO_UNAVAILABLE" } }), "The demo is not available right now. You can still sign in with GitHub."],
  ["a server that fails", () => answer(500, { detail: "boom" }), "The demo did not open. Try again."],
  ["an answer that is not a session", () => answer(200, { data: { nothing: true } }), "The demo did not open. Try again."],
  ["no connection", () => Promise.reject(new TypeError("Failed to fetch")), "We couldn't reach Village Sqwhere. Check your connection and try again."],
])("%s is said under the button, nobody is signed in, and it can be pressed again", async (_, reply, sentence) => {
  fetchMock.mockImplementation(reply);
  pair();
  const button = screen.getByRole("button", { name: "Try the demo" });
  fireEvent.click(button);
  await waitFor(() => expect(note()).toBe(sentence));
  expect(replace).not.toHaveBeenCalled();
  expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  expect(button.hasAttribute("aria-busy")).toBe(false);

  fetchMock.mockImplementation(() => answer(200, { data: tokens }));
  fireEvent.click(button);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/en/village"));
});

test("the footer's copy of the line says nothing until there is something to report", async () => {
  fetchMock.mockImplementation(() => answer(404, { detail: { code: "DEMO_UNAVAILABLE" } }));
  const { container } = render(
    <li>
      <DemoButton lang="en" className="demo">
        Try the demo
      </DemoButton>
      <DemoNote lang="en" quiet />
    </li>,
  );
  expect(container.querySelector("[aria-live]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try the demo" }));
  await waitFor(() => expect(container.querySelector("[aria-live]")?.textContent).toMatch(/^The demo is not available/));
});
