import { call } from "../ideas/ideas-api";

export type PostType =
  | "general"
  | "question"
  | "architecture_challenge"
  | "code_review_request"
  | "oss_release"
  | "rfc"
  | "research_note"
  | "hub_milestone";

// A post as the API answers it. `liked_by_me` and `saved_by_me` are the signed-in developer's.
export type Post = {
  id: string;
  type: PostType;
  title: string | null;
  body: string;
  link_url: string | null;
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

export const loadFeed = (offset = 0) => call<PostPage>(`/v1/feed?${paging(offset)}`);

export const loadSavedPosts = (offset = 0) => call<PostPage>(`/v1/me/saved-posts?${paging(offset)}`);

export const loadPostsBy = (username: string, offset = 0) =>
  call<PostPage>(`/v1/posts?author=${encodeURIComponent(username)}&${paging(offset)}`);

export const loadPost = async (id: string) => (await call<{ data: Post }>(`/v1/posts/${encodeURIComponent(id)}`)).data;

// Only the author can delete a post, and the API takes no reason from the author.
export const deletePost = (id: string) => call<null>(`/v1/posts/${encodeURIComponent(id)}`, "DELETE");

export type PostLikeData = { liked: boolean; like_count: number };
export type PostSaveData = { saved: boolean };

// Likes and saves answer 200 with their new state on PUT, and 204 with no body on DELETE.
export const setMark = (id: string, mark: "like" | "save", on: boolean) =>
  call<{ data: PostLikeData | PostSaveData } | null>(
    `/v1/posts/${encodeURIComponent(id)}/${mark}`,
    on ? "PUT" : "DELETE",
  );

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
