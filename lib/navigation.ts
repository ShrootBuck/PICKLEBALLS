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
  kind: "proof" | "check-in",
  id: string,
) {
  return `/posts/${kind}/${encodeURIComponent(id)}?${new URLSearchParams({ circle: circleId })}`;
}

export function memberHref(
  circleId: string,
  userId: string,
  tab: "posts" | "tasks" = "posts",
  day?: string,
) {
  const query = new URLSearchParams({ circle: circleId, tab });
  if (day) query.set("day", day);
  return `/members/${encodeURIComponent(userId)}?${query}`;
}
