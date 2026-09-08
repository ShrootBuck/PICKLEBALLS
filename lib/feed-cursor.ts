import { z } from "zod";
import type { FeedPost, PostKind } from "@/lib/social-types";

const cursorSchema = z
  .object({
    time: z.string().datetime(),
    kind: z.enum(["proof", "check-in"]),
    id: z.string().min(1).max(100),
    circle: z.string().min(1).max(100),
    member: z.string().max(100),
  })
  .strict();
export type FeedCursor = z.infer<typeof cursorSchema>;

export function encodeFeedCursor(post: FeedPost, circle: string, member = "") {
  return encodeURIComponent(
    JSON.stringify({
      time: post.createdAt,
      kind: post.kind,
      id: post.id,
      circle,
      member,
    }),
  );
}

export function parseFeedCursor(
  value: string,
  circle: string,
  member = "",
): FeedCursor | null {
  if (value.length > 1500) return null;
  try {
    const result = cursorSchema.safeParse(
      JSON.parse(decodeURIComponent(value)),
    );
    if (
      !result.success ||
      result.data.circle !== circle ||
      result.data.member !== member
    )
      return null;
    return result.data;
  } catch {
    return null;
  }
}

export function compareFeedPosts(
  a: Pick<FeedPost, "createdAt" | "kind" | "id">,
  b: Pick<FeedPost, "createdAt" | "kind" | "id">,
) {
  for (const [left, right] of [
    [a.createdAt, b.createdAt],
    [a.kind, b.kind],
    [a.id, b.id],
  ]) {
    if (left !== right) return left > right ? -1 : 1;
  }
  return 0;
}

// Both source queries use the same total ordering, including timestamp ties
// across different tables. This also works if the cursor post was replaced.
export function feedBoundary(
  kind: PostKind,
  field: "submittedAt" | "createdAt",
  cursor: FeedCursor | null,
) {
  if (!cursor) return {};
  const time = new Date(cursor.time);
  if (kind < cursor.kind) return { [field]: { lte: time } };
  if (kind > cursor.kind) return { [field]: { lt: time } };
  return {
    OR: [{ [field]: { lt: time } }, { [field]: time, id: { lt: cursor.id } }],
  };
}
