import type { PostComment, TopComment } from "./feed-api";

// A comment and what is known of its replies. `more` says the API has replies this thread does
// not hold yet, and `offset` is where the next page of them starts. The reply count cannot say it:
// it includes deleted replies that no list returns.
export type Thread = { comment: PostComment; replies: Thread[]; more: boolean; offset: number };

export const thread = (comment: PostComment, replies: PostComment[] = []): Thread => ({
  comment,
  replies: replies.map((reply) => thread(reply)),
  more: comment.reply_count > replies.length,
  offset: 0,
});

export const fromList = (list: TopComment[]): Thread[] => list.map(({ replies, ...comment }) => thread({ ...comment }, replies));

// The API's order: oldest first, the id breaking a tie.
const inOrder = (a: Thread, b: Thread) =>
  Date.parse(a.comment.created_at) - Date.parse(b.comment.created_at) || (a.comment.id < b.comment.id ? -1 : 1);

// Puts threads among the ones already held. One that is held keeps what was opened under it and
// takes the newer comment; a new one lands in the API's order, so a comment just written sits
// after the pages loaded so far and is not repeated when its page arrives.
export function place(held: Thread[], added: Thread[]): Thread[] {
  const kept = held.map((have) => {
    const again = added.find((other) => other.comment.id === have.comment.id);
    return again ? { ...have, comment: again.comment } : have;
  });
  return [...kept, ...added.filter((other) => !held.some((have) => have.comment.id === other.comment.id))].sort(inOrder);
}

// Changes the thread with this id wherever it is; returning null removes it.
export function change(threads: Thread[], id: string, edit: (found: Thread) => Thread | null): Thread[] {
  return threads.flatMap((have) => {
    if (have.comment.id === id) return edit(have) ?? [];
    return [{ ...have, replies: change(have.replies, id, edit) }];
  });
}
