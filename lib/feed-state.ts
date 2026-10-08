import { compareFeedPosts } from "@/lib/feed-cursor";
import { type FeedPage, postKey } from "@/lib/social-types";

// Refresh through the oldest visible post so loaded pages receive new verdicts
// and comment counts too. The server still serves each page in batches of 20.
export async function refreshFeedPages(
  current: FeedPage,
  readPage: (cursor?: string) => Promise<FeedPage>,
): Promise<FeedPage> {
  const oldest = current.items.at(-1);
  const fresh = await readPage();
  while (
    oldest &&
    fresh.nextCursor &&
    fresh.items.length &&
    compareFeedPosts(fresh.items[fresh.items.length - 1], oldest) < 0
  ) {
    const page = await readPage(fresh.nextCursor);
    const known = new Set(fresh.items.map(postKey));
    fresh.items.push(...page.items.filter((item) => !known.has(postKey(item))));
    fresh.nextCursor = page.nextCursor;
  }
  return fresh;
}

export function reconcileFeed(current: FeedPage, fresh: FeedPage): FeedPage {
  if (!fresh.nextCursor || !fresh.items.length) return fresh;
  const ids = new Set(fresh.items.map(postKey));
  const replacedTasks = new Set(
    fresh.items.filter((p) => p.kind === "proof").map((p) => p.commitmentId),
  );
  const last = fresh.items[fresh.items.length - 1];
  const older = current.items.filter(
    (p) =>
      !ids.has(postKey(p)) &&
      compareFeedPosts(p, last) > 0 &&
      !(p.kind === "proof" && replacedTasks.has(p.commitmentId)),
  );
  return {
    items: [...fresh.items, ...older],
    nextCursor: older.length ? current.nextCursor : fresh.nextCursor,
  };
}
