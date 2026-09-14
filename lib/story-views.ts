import { postKey, type StoryFrame, type StoryGroup } from "@/lib/social-types";
import { STORY_WINDOW_MS, storyFrameKey } from "@/lib/stories";

export type StoryViewReceipt = {
  kind: StoryFrame["post"]["kind"];
  id: string;
  frame: number;
  createdAt: string;
  pending: boolean;
};

export function storyViewKey(receipt: StoryViewReceipt) {
  return storyFrameKey(receipt, receipt.frame);
}

// Browser storage is optional and untrusted. Keep only receipts for live stories.
export function parseStoryViews(value: string | null, now = Date.now()) {
  const receipts = new Map<string, StoryViewReceipt>();
  try {
    const items: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(items)) return receipts;
    for (const item of items.slice(-2000)) {
      if (
        !item ||
        !["proof", "check-in", "screen-time"].includes(item.kind) ||
        typeof item.id !== "string" ||
        !item.id ||
        item.id.length > 100 ||
        !Number.isInteger(item.frame) ||
        item.frame < 0 ||
        item.frame > 100 ||
        typeof item.createdAt !== "string" ||
        typeof item.pending !== "boolean"
      )
        continue;
      const age = now - new Date(item.createdAt).getTime();
      if (!Number.isFinite(age) || age < 0 || age >= STORY_WINDOW_MS) continue;
      receipts.set(storyViewKey(item), item);
    }
  } catch {
    // Private browsing, old formats, and damaged storage must not break stories.
  }
  return receipts;
}

export function applyStoryViews(
  groups: StoryGroup[],
  receipts: Iterable<StoryViewReceipt>,
) {
  const seen = new Map<string, Set<number>>();
  for (const receipt of receipts) {
    const key = postKey(receipt);
    const frames = seen.get(key) ?? new Set<number>();
    frames.add(receipt.frame);
    seen.set(key, frames);
  }
  return groups.map((group) => ({
    ...group,
    posts: group.posts.map((item) => {
      const frames = seen.get(postKey(item.post));
      return frames
        ? { ...item, seenFrames: [...new Set([...item.seenFrames, ...frames])] }
        : item;
    }),
  }));
}
