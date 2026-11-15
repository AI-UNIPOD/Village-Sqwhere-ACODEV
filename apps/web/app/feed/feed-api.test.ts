import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { IdeaError } from "../ideas/ideas-api";
import { API_URL, SESSION_KEY } from "../session/session";
import { deleteImage, uploadImage } from "./feed-api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: "2099-01-01T00:00:00Z", refresh_expires_at: "2099-01-01T00:00:00Z" }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  localStorage.clear();
});

const picture = { id: "img-1", url: "/v1/post-images/img-1", mime_type: "image/png", byte_size: 1, width: 2, height: 3, position: 0, created_at: "2026-11-15T10:00:00Z" };

test("an upload is a multipart form with the post's id and the file, and the browser sets the content type", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: picture }), { status: 201 }));
  const sent = new File(["x"], "map.png", { type: "image/png" });
  expect(await uploadImage("post-1", sent)).toEqual(picture);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${API_URL}/v1/uploads`);
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({ Authorization: "Bearer a" });
  expect(init.body).toBeInstanceOf(FormData);
  expect(init.body.get("post_id")).toBe("post-1");
  expect((init.body.get("file") as File).name).toBe("map.png");
});

test("a refused upload becomes an error with the API's status and code", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: "POST_IMAGE_LIMIT" } }), { status: 409 }));
  const error = await uploadImage("post-1", new File(["x"], "a.png")).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(IdeaError);
  expect(error).toMatchObject({ status: 409, code: "POST_IMAGE_LIMIT" });
});

test("removing an image is a DELETE on its id and answers with nothing", async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  expect(await deleteImage("img 1")).toBeNull();
  expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/v1/uploads/img%201`);
  expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
});

test("a refused removal becomes an error with the API's code", async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: "NOT_POST_AUTHOR" } }), { status: 403 }));
  await expect(deleteImage("img-1")).rejects.toMatchObject({ status: 403, code: "NOT_POST_AUTHOR" });
});
