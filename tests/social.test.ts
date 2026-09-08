import { expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import {
  compareFeedPosts,
  encodeFeedCursor,
  parseFeedCursor,
} from "@/lib/feed-cursor";
import { reconcileFeed, refreshFeedPages } from "@/lib/feed-state";
import { latestScreenTimeWeek, rankScreenTime } from "@/lib/screen-time";
import type { FeedPost } from "@/lib/social-types";
import { phoenixDateKey, phoenixDayDueAt } from "@/lib/time";
import { createTimeblockPdf } from "@/lib/timeblock-pdf";
import { timeblockWeek } from "@/lib/timeblocks";

const author = { id: "member", name: "Member", image: null, initials: "M" };
function post(id: string, minute = 0): FeedPost {
  return {
    kind: "proof",
    id,
    circleId: "circle",
    createdAt: new Date(Date.UTC(2026, 8, 8, 15, minute)).toISOString(),
    author,
    body: null,
    likeCount: 0,
    likedByMe: false,
    commentCount: 0,
    title: "Task",
    commitmentId: id,
    definitionOfDone: "Finish it",
    mediaIds: [],
    reviewStatus: "PENDING",
    canReview: true,
    requiredApprovals: 1,
    verifiedBy: null,
  };
}
test("feed cursor is bound to circle and profile and rejects malformed input", () => {
  const cursor = encodeFeedCursor(post("a"), "circle", "member");
  expect(parseFeedCursor(cursor, "circle", "member")?.id).toBe("a");
  expect(parseFeedCursor(cursor, "other", "member")).toBeNull();
  expect(parseFeedCursor(cursor, "circle")).toBeNull();
  expect(parseFeedCursor("%xx", "circle")).toBeNull();
  expect(parseFeedCursor("a".repeat(1600), "circle")).toBeNull();
});
test("total ordering handles equal timestamps across kinds and IDs", () => {
  const a = post("a"),
    b = post("b");
  const checkIn = { ...a, kind: "check-in" as const };
  expect(
    [checkIn, a, b].sort(compareFeedPosts).map((p) => `${p.kind}:${p.id}`),
  ).toEqual(["proof:b", "proof:a", "check-in:a"]);
});
test("refresh preserves older pages, replaces old proof attempts, and retains changed likes", () => {
  const old = post("old", 1),
    older = post("older", 0);
  const replacement = { ...post("replacement", 10), commitmentId: "old" };
  const fresh = {
    items: [replacement, post("middle", 5)],
    nextCursor: "fresh",
  };
  const result = reconcileFeed(
    { items: [post("middle", 5), old, older], nextCursor: "older-cursor" },
    fresh,
  );
  expect(result.items.map((p) => p.id)).toEqual([
    "replacement",
    "middle",
    "older",
  ]);
  expect(result.nextCursor).toBe("older-cursor");
  expect(
    reconcileFeed(result, { items: [replacement], nextCursor: null }).items,
  ).toHaveLength(1);
});
test("explicit refresh updates older loaded posts without dropping the reading window", async () => {
  const newest = post("newest", 8);
  const old = post("old", 3);
  const oldest = post("oldest", 1);
  const calls: (string | undefined)[] = [];
  const refreshed = await refreshFeedPages(
    { items: [newest, old, oldest], nextCursor: "previous-tail" },
    async (cursor) => {
      calls.push(cursor);
      return cursor
        ? {
            items: [
              { ...old, reviewStatus: "APPROVED", canReview: false },
              { ...oldest, commentCount: 4, likeCount: 2 },
            ],
            nextCursor: "fresh-tail",
          }
        : { items: [post("new", 10), newest], nextCursor: "second-page" };
    },
  );
  expect(calls).toEqual([undefined, "second-page"]);
  expect(refreshed.items.map((item) => item.id)).toEqual([
    "new",
    "newest",
    "old",
    "oldest",
  ]);
  expect(refreshed.items[2]).toMatchObject({
    reviewStatus: "APPROVED",
    canReview: false,
  });
  expect(refreshed.items[3]).toMatchObject({ commentCount: 4, likeCount: 2 });
  expect(refreshed.nextCursor).toBe("fresh-tail");
});
test("Phoenix midnight and reporting weeks stay distinct", () => {
  expect(phoenixDateKey(new Date("2026-09-07T06:59:59Z"))).toBe("2026-09-06");
  expect(phoenixDateKey(new Date("2026-09-07T07:00:00Z"))).toBe("2026-09-07");
  expect(phoenixDayDueAt("2026-09-06")?.toISOString()).toBe(
    "2026-09-07T06:59:59.999Z",
  );
  expect(latestScreenTimeWeek(new Date("2026-09-07T07:00:00Z"))).toBe(
    "2026-08-30",
  );
  expect(timeblockWeek("2026-09-14").startKey).toBe("2026-09-07");
});
test("screen-time ties and missing submissions retain honest ranks", () => {
  const rows = [50, null, 50, 70].map((minutes, i) => ({
    userId: String(i),
    name: String(i),
    dailyAverageMinutes: minutes,
    previousDailyAverageMinutes: 90,
    mediaId: null,
  }));
  expect(rankScreenTime(rows).map((r) => r.rank)).toEqual([1, 1, 3, null]);
});
test("manual timeblock entries produce a readable two-page PDF", async () => {
  const bytes = await createTimeblockPdf({
    studentName: "Test Member",
    dueMonday: "2026-09-14",
    tasks: [
      {
        id: "manual",
        title: "Manual study session",
        startedAt: new Date("2026-09-08T20:00:00Z"),
        completedAt: new Date("2026-09-08T21:00:00Z"),
      },
    ],
  });
  const document = await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBe(2);
  expect(bytes.length).toBeGreaterThan(1000);
});
