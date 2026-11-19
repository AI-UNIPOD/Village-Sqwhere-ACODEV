// The letters in a round avatar: the first letter of the first and of the last word of a name, in
// capitals, so "Ọláolúwa Adébáyò" is "ỌA" and one word is one letter. It reads whole characters, so
// an accented or dotted letter is never cut in half. A name with no letters falls back to the
// username, and that to a single dot, so the avatar is never empty.
export function initials(displayName: string, username = ""): string {
  const words = (displayName.trim() || username.trim()).split(/[\s_-]+/).filter(Boolean);
  const first = Array.from(words[0] ?? "")[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : undefined;
  return ((first ?? "") + (last ?? "")).toLocaleUpperCase() || "•";
}
