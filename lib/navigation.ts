export function safeAppPath(value: unknown, fallback = "/squad") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) <= 32)
  )
    return fallback;
  return value;
}

export function squadHref(circleId: string, focusId?: string | null) {
  const query = new URLSearchParams({ circle: circleId });
  if (focusId) query.set("focus", focusId);
  return `/squad?${query}`;
}

export function postHref(
  circleId: string,
  kind: "proof" | "check-in" | "screen-time" | "streak",
  id: string,
) {
  if (kind === "screen-time")
    return `/screen-time?${new URLSearchParams({ circle: circleId })}`;
  return `/posts/${kind}/${encodeURIComponent(id)}?${new URLSearchParams({ circle: circleId })}`;
}

export function bucketItemHref(circleId: string, id: string) {
  return `/bucket-list/${encodeURIComponent(id)}?${new URLSearchParams({ circle: circleId })}`;
}

// A hash, not a search param, so opening the form never changes the page key.
export const newStreakHash = "#new";
export const newStreakHref = `/streaks${newStreakHash}`;

export function streakHref(circleId: string, id: string) {
  return `/streaks/${encodeURIComponent(id)}?${new URLSearchParams({ circle: circleId })}`;
}

export function memberHref(
  circleId: string,
  userId: string,
  tab: "posts" | "tasks" | "streaks" = "posts",
  day?: string,
) {
  const query = new URLSearchParams({ circle: circleId, tab });
  if (day) query.set("day", day);
  return `/members/${encodeURIComponent(userId)}?${query}`;
}
