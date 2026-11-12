import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { SESSION_KEY } from "../session/session";
import { loadProfile, useProfile } from "./profile";

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const me = (display_name: string, username = "kofi-mensah") => reply(200, { data: { username, display_name } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
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

test("the profile is the developer's name and username from GET /v1/me", async () => {
  fetchMock.mockResolvedValue(me("Kofi Mensah"));
  expect(await loadProfile()).toEqual({ displayName: "Kofi Mensah", username: "kofi-mensah" });
  expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/v1/me");
});

test("with no name on GitHub, the API's copy of the username is not taken for a name", async () => {
  fetchMock.mockResolvedValue(me("kofi-mensah"));
  expect(await loadProfile()).toEqual({ displayName: null, username: "kofi-mensah" });
});

test("a failed answer is an error, not a made-up profile", async () => {
  fetchMock.mockResolvedValue(reply(500, { detail: "boom" }));
  await expect(loadProfile()).rejects.toThrow("GET /v1/me answered 500");
});

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>Error page</p> : this.props.children;
  }
}

function Name() {
  const profile = useProfile();
  return <p>{profile ? profile.displayName : "Loading"}</p>;
}

test("the hook shows loading, then the profile", async () => {
  fetchMock.mockResolvedValue(me("Kofi Mensah"));
  render(<Name />);
  expect(screen.getByText("Loading")).toBeTruthy();
  expect(await screen.findByText("Kofi Mensah")).toBeTruthy();
});

test("the hook hands a failure to the error page", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  render(
    <Boundary>
      <Name />
    </Boundary>,
  );
  await waitFor(() => expect(screen.getByText("Error page")).toBeTruthy());
});
