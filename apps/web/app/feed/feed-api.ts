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

export type PostLikeData = { liked: boolean; like_count: number };
export type PostSaveData = { saved: boolean };

// Likes and saves answer 200 with their new state on PUT, and 204 with no body on DELETE.
export const setMark = (id: string, mark: "like" | "save", on: boolean) =>
  call<{ data: PostLikeData | PostSaveData } | null>(
    `/v1/posts/${encodeURIComponent(id)}/${mark}`,
    on ? "PUT" : "DELETE",
  );
