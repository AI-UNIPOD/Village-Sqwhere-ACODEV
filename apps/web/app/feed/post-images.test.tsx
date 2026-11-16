import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { API_URL } from "../session/session";
import { imageSrc, type Post, type PostImage } from "./feed-api";
import { PostCard } from "./post-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  useParams: () => ({ lang: "en" }),
}));

afterEach(cleanup);

const image = (n: number, over: Partial<PostImage> = {}): PostImage => ({
  id: `img-${n}`,
  url: `/v1/post-images/img-${n}`,
  mime_type: "image/webp",
  byte_size: 20_000,
  width: 1200,
  height: 800,
  position: n - 1,
  created_at: "2026-11-15T10:00:00Z",
  ...over,
});

const post = (count: number): Post => ({
  id: "post-1",
  type: "general",
  title: "Pooling with asyncpg",
  body: "We moved to a pool of ten.",
  link_url: null,
  attachments: Array.from({ length: count }, (_, index) => image(index + 1)),
  author: { username: "wanjiru-kamau", display_name: "Wanjiru Kamau", is_verified: true },
  topics: [],
  like_count: 0,
  comment_count: 0,
  created_at: new Date().toISOString(),
  edited_at: null,
  liked_by_me: false,
  saved_by_me: false,
});

const card = (count: number, lang: "en" | "fr" = "en") =>
  render(
    <ul>
      <PostCard lang={lang} post={post(count)} now={Date.now()} onChange={() => {}} />
    </ul>,
  );

test("an image address is the API's address and the relative url of the image", () => {
  expect(imageSrc(image(1))).toBe(`${API_URL}/v1/post-images/img-1`);
});

test("a post with no images shows no list of them", () => {
  const { container } = card(0);
  expect(container.querySelector("img")).toBeNull();
});

test("one image is full width, sized from its own width and height, lazy, and leads to the post", () => {
  card(1);
  const picture = screen.getByRole("img", { name: "Image 1 of 1 attached to this post" });
  expect(picture.getAttribute("src")).toBe(`${API_URL}/v1/post-images/img-1`);
  expect(picture.getAttribute("width")).toBe("1200");
  expect(picture.getAttribute("height")).toBe("800");
  expect(picture.getAttribute("loading")).toBe("lazy");
  expect(picture.getAttribute("decoding")).toBe("async");
  expect(picture.closest("li")!.style.aspectRatio).toBe("1.5 / 1");
  expect(picture.closest("a")!.getAttribute("href")).toBe("/en/posts/view?id=post-1");
});

test("a very tall single image is cropped to a box that cannot fill the screen", () => {
  const tall = post(1);
  tall.attachments = [image(1, { width: 400, height: 4000 })];
  render(
    <ul>
      <PostCard lang="en" post={tall} now={Date.now()} onChange={() => {}} />
    </ul>,
  );
  expect(screen.getByRole("img").closest("li")!.style.aspectRatio).toBe("0.8 / 1");
});

test("a wide single image, like a diagram, keeps its whole width up to 6 to 1", () => {
  const wide = post(1);
  wide.attachments = [image(1, { width: 1200, height: 216 })];
  render(
    <ul>
      <PostCard lang="en" post={wide} now={Date.now()} onChange={() => {}} />
    </ul>,
  );
  expect(Number.parseFloat(screen.getByRole("img").closest("li")!.style.aspectRatio)).toBeCloseTo(5.56, 1);
});

test.each([2, 3, 4])("%i images are a grid with every one in order and none hidden", (count) => {
  const { container } = card(count);
  const list = container.querySelector("ul ul")!;
  expect(list.getAttribute("data-count")).toBe(String(count));
  const names = within(list as HTMLElement).getAllByRole("img").map((picture) => picture.getAttribute("alt"));
  expect(names).toEqual(Array.from({ length: count }, (_, index) => `Image ${index + 1} of ${count} attached to this post`));
  expect(list.textContent).not.toContain("+");
});

test("six images show four, with +2 on the fourth, and all lead to the post", () => {
  const { container } = card(6);
  const list = container.querySelector("ul ul") as HTMLElement;
  expect(within(list).getAllByRole("img")).toHaveLength(4);
  const fourth = within(list).getAllByRole("listitem")[3];
  expect(fourth.textContent).toContain("+2");
  expect(within(fourth).getByRole("link").getAttribute("href")).toBe("/en/posts/view?id=post-1");
  expect(within(fourth).getByRole("img").getAttribute("alt")).toBe("Image 4 of 6 attached to this post");
  expect(within(fourth).getByText("and 2 more")).toBeTruthy();
});

test("the alt text is in French too", () => {
  card(2, "fr");
  expect(screen.getByRole("img", { name: "Image 2 sur 2 jointe à cette publication" })).toBeTruthy();
});

test("an image that cannot load shows a line of text in its box instead of a broken icon", () => {
  card(2);
  fireEvent.error(screen.getByRole("img", { name: "Image 2 of 2 attached to this post" }));
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(screen.getByText("This image could not be loaded.")).toBeTruthy();
});
