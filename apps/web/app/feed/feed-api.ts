import { call } from "../ideas/ideas-api";
import { API_URL } from "../session/session";

export type PostType =
  | "general"
  | "question"
  | "architecture_challenge"
  | "code_review_request"
  | "oss_release"
  | "rfc"
  | "research_note"
  | "hub_milestone";

// One image of a post. `url` is relative to the API, and the API sends a post's images in
// `position` order.
export type PostImage = {
  id: string;
  url: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  position: number;
  created_at: string;
};

// A post as the API answers it. `liked_by_me` and `saved_by_me` are the signed-in developer's.
export type Post = {
  id: string;
  type: PostType;
  title: string | null;
  body: string;
  link_url: string | null;
  attachments: PostImage[];
  author: { username: string; display_name: string; is_verified: boolean };
  topics: { slug: string; name: string }[];
  like_count: number;
  comment_count: number;
  created_at: string;
  edited_at: string | null;
  liked_by_me: boolean;
  saved_by_me: boolean;
};

export type PostPage = { data: Post[]; next_offset: number | null };

const paging = (offset: number) => `offset=${offset}&limit=20`;

// A view of the feed chosen in the page's address: one kind, one topic, or both. Nothing is saved.
export type FeedFilter = { type?: Kind; topic?: string };

// "type=question&topic=python", the same words in the page's address and in the request.
export function filterQuery({ type, topic }: FeedFilter) {
  const query = new URLSearchParams();
  if (type) query.set("type", type);
  if (topic) query.set("topic", topic);
  return query.toString();
}

// The For you feed takes no kind or topic, so a filtered view asks for everyone's posts.
export function loadFeed(offset = 0, filter: FeedFilter = {}) {
  const query = filterQuery(filter);
  return call<PostPage>(query ? `/v1/posts?${query}&${paging(offset)}` : `/v1/feed?${paging(offset)}`);
}

export const loadSavedPosts = (offset = 0) => call<PostPage>(`/v1/me/saved-posts?${paging(offset)}`);

export const loadPostsBy = (username: string, offset = 0) =>
  call<PostPage>(`/v1/posts?author=${encodeURIComponent(username)}&${paging(offset)}`);

// The newest questions, for the guided tour to pick one with a conversation under it.
export const loadQuestions = () => call<PostPage>("/v1/posts?type=question&limit=20");

export const loadPost = async (id: string) => (await call<{ data: Post }>(`/v1/posts/${encodeURIComponent(id)}`)).data;

// Only the author can delete a post, and the API takes no reason from the author.
export const deletePost = (id: string) => call<null>(`/v1/posts/${encodeURIComponent(id)}`, "DELETE");

// Likes and saves answer 204 with no body: turning one on or off is the same request each time.
export const setMark = (id: string, mark: "like" | "save", on: boolean) =>
  call<null>(`/v1/posts/${encodeURIComponent(id)}/${mark}`, on ? "PUT" : "DELETE");

// What the browser loads for an image. The address needs no sign-in, so a plain <img> can use it.
export const imageSrc = (image: PostImage) => `${API_URL}${image.url}`;

// The limits the API checks, said in the page before anything is sent. 4 MB leaves room for the
// form around the file inside Vercel's 4.5 MB request limit.
export const IMAGE_LIMITS = { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 4 * 1024 * 1024, perPost: 10 };

// Images go up one request each, after the post exists: the API takes the post's id in the form.
export async function uploadImage(postId: string, file: File): Promise<PostImage> {
  const form = new FormData();
  form.append("post_id", postId);
  form.append("file", file);
  return (await call<{ data: PostImage }>("/v1/uploads", "POST", form)).data;
}

// Only the post's author can remove an image; the others keep their positions.
export const deleteImage = (id: string) => call<null>(`/v1/uploads/${encodeURIComponent(id)}`, "DELETE");

// The kinds a developer can choose, in the order the form lists them. The API also has
// `hub_milestone`, which it refuses from a person.
export const KINDS = ["general", "question", "architecture_challenge", "code_review_request", "oss_release", "rfc", "research_note"] as const;
export type Kind = (typeof KINDS)[number];

export const POST_LIMITS = { titleMax: 200, bodyMax: 20000, linkMax: 2048, topicsMax: 5 };

// What the form holds. An empty `title` or `link` means the post has none.
export type PostFields = { kind: PostType; title: string; body: string; link: string; topics: string[] };

export const toFields = (post: Post): PostFields => ({
  kind: post.type,
  title: post.title ?? "",
  body: post.body,
  link: post.link_url ?? "",
  topics: post.topics.map((topic) => topic.slug),
});

// Optional parts that are empty are left out: the API refuses an empty title.
export async function createPost(fields: PostFields): Promise<Post> {
  const title = fields.title.trim();
  const link = fields.link.trim();
  const sent = {
    type: fields.kind,
    ...(title && { title }),
    body: fields.body,
    ...(link && { link_url: link }),
    topics: fields.topics,
  };
  return (await call<{ data: Post }>("/v1/posts", "POST", sent)).data;
}

// Sends only what changed since `saved`, and nothing at all when nothing did. The kind and the
// topics are not sent: the API cannot change them after posting. A cleared title or link is null.
export async function updatePost(fields: PostFields, saved: Post): Promise<Post> {
  const before = toFields(saved);
  const changed = {
    ...(fields.title.trim() !== before.title && { title: fields.title.trim() || null }),
    ...(fields.body !== before.body && { body: fields.body }),
    ...(fields.link.trim() !== before.link && { link_url: fields.link.trim() || null }),
  };
  if (Object.keys(changed).length === 0) return saved;
  return (await call<{ data: Post }>(`/v1/posts/${encodeURIComponent(saved.id)}`, "PATCH", changed)).data;
}

// Replaces the topics of the feed. The request key is `technologies`, because the API keeps
// feed topics in its technologies table. No topics means the feed shows every post.
export const saveFeedTopics = async (slugs: string[]) =>
  (await call<{ data: { slug: string; name: string }[] }>("/v1/me/feed-topics", "PUT", { technologies: slugs })).data;

// A comment or a reply. A deleted one that still has replies comes back with `deleted` true and no
// author, body or `edited_at`, so its replies stay reachable. `reply_count` counts direct replies
// including deleted ones, so it can be higher than the replies a list holds.
export type PostComment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  depth: number;
  deleted: boolean;
  author: { username: string; display_name: string; is_verified: boolean } | null;
  body: string | null;
  like_count: number;
  reply_count: number;
  created_at: string;
  edited_at: string | null;
  liked_by_me: boolean;
};

// The comments on a post come with their first two replies.
export type TopComment = PostComment & { replies: PostComment[] };

export const COMMENT_MAX = 5000;

// Both lists are oldest first and paged like the posts.
export const loadComments = (postId: string, offset = 0) =>
  call<{ data: TopComment[]; next_offset: number | null }>(`/v1/posts/${encodeURIComponent(postId)}/comments?${paging(offset)}`);

export const loadReplies = (commentId: string, offset = 0) =>
  call<{ data: PostComment[]; next_offset: number | null }>(`/v1/comments/${encodeURIComponent(commentId)}/replies?${paging(offset)}`);

// A comment and the replies under it, down to five levels below it, ordered by depth and then
// oldest first. `fromThread` puts them back into a tree.
export const loadThread = (commentId: string, offset = 0) =>
  call<{ data: PostComment[]; next_offset: number | null }>(`/v1/comments/${encodeURIComponent(commentId)}/thread?${paging(offset)}`);

// With a `parentId` it is a reply to that comment.
export async function createComment(postId: string, body: string, parentId?: string): Promise<PostComment> {
  const sent = { body, ...(parentId && { parent_id: parentId }) };
  return (await call<{ data: PostComment }>(`/v1/posts/${encodeURIComponent(postId)}/comments`, "POST", sent)).data;
}

export const updateComment = async (id: string, body: string) =>
  (await call<{ data: PostComment }>(`/v1/comments/${encodeURIComponent(id)}`, "PATCH", { body })).data;

// The API lets a moderator delete anyone's comment too; the web app offers it to the author only.
export const deleteComment = (id: string) => call<null>(`/v1/comments/${encodeURIComponent(id)}`, "DELETE");

// Like a post's like: 204 with no body, and the same request each time.
export const setCommentLike = (id: string, on: boolean) =>
  call<null>(`/v1/comments/${encodeURIComponent(id)}/like`, on ? "PUT" : "DELETE");
