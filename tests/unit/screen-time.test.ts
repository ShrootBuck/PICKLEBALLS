import { describe, expect, test } from "bun:test";
import {
  formatScreenTime,
  isScreenTimeWeek,
  latestScreenTimeWeek,
  rankScreenTime,
  validateScreenTimeExtraction,
} from "@/lib/screen-time";

describe("screen-time reporting weeks", () => {
  test("opens the next report at Sunday midnight in Phoenix, not UTC", () => {
    expect(latestScreenTimeWeek(new Date("2026-09-06T06:59:59Z"))).toBe(
      "2026-08-23",
    );
    expect(latestScreenTimeWeek(new Date("2026-09-06T07:00:00Z"))).toBe(
      "2026-08-30",
    );
    expect(latestScreenTimeWeek(new Date("2026-09-12T19:00:00Z"))).toBe(
      "2026-08-30",
    );
    expect(latestScreenTimeWeek(new Date("2026-09-13T07:00:00Z"))).toBe(
      "2026-09-06",
    );
  });
  test("handles year boundaries and rejects partial or invalid weeks", () => {
    expect(latestScreenTimeWeek(new Date("2027-01-03T18:00:00Z"))).toBe(
      "2026-12-27",
    );
    expect(isScreenTimeWeek("2026-08-30", "2026-08-30")).toBe(true);
    for (const value of ["2026-08-31", "2026-09-06", "2026-02-30", "garbage"])
      expect(isScreenTimeWeek(value, "2026-08-30")).toBe(false);
  });
});

const validRead = {
  isWeeklyReport: true,
  dailyAverageMinutes: 125,
  totalMinutes: null,
};
describe("screen-time extraction validation", () => {
  test("accepts Last Week’s Average without calendar dates or device evidence", () => {
    // Regression: the supplied iPhone screenshot shows Week selected,
    // Last Week’s Average 3h 46m, Total Screen Time 26h 27m, and a
    // Show This Week navigation button. No calendar dates are displayed.
    expect(
      validateScreenTimeExtraction({
        isWeeklyReport: true,
        dailyAverageMinutes: 226,
        totalMinutes: 1587,
      }),
    ).toEqual({ dailyAverageMinutes: 226, totalMinutes: 1587 });
  });
  test("keeps visible zeroes and does not invent a missing total", () => {
    expect(validateScreenTimeExtraction(validRead)).toEqual({
      dailyAverageMinutes: 125,
      totalMinutes: null,
    });
    expect(
      validateScreenTimeExtraction({ ...validRead, dailyAverageMinutes: 0 })
        .dailyAverageMinutes,
    ).toBe(0);
  });
  test("rejects non-weekly screenshots, unreadable averages and impossible values", () => {
    for (const patch of [
      { isWeeklyReport: false },
      { dailyAverageMinutes: null },
      { dailyAverageMinutes: 1500 },
      { dailyAverageMinutes: -1 },
      { dailyAverageMinutes: 1.5 },
      { dailyAverageMinutes: "3h 46m" },
    ])
      expect(() =>
        validateScreenTimeExtraction({ ...validRead, ...patch }),
      ).toThrow();
  });
  test("allows minute rounding and omits an inconsistent optional total", () => {
    expect(
      validateScreenTimeExtraction({ ...validRead, totalMinutes: 879 })
        .totalMinutes,
    ).toBe(879);
    expect(
      validateScreenTimeExtraction({ ...validRead, totalMinutes: 900 }),
    ).toEqual({ dailyAverageMinutes: 125, totalMinutes: null });
  });
});

test("leaderboard keeps missing entries unranked, shares ties and computes improvement only from adjacent data", () => {
  const values = [
    {
      userId: "a",
      name: "A",
      dailyAverageMinutes: null,
      previousDailyAverageMinutes: 120,
    },
    {
      userId: "b",
      name: "B",
      dailyAverageMinutes: 60,
      previousDailyAverageMinutes: 90,
    },
    {
      userId: "c",
      name: "C",
      dailyAverageMinutes: 60,
      previousDailyAverageMinutes: null,
    },
    {
      userId: "d",
      name: "D",
      dailyAverageMinutes: 90,
      previousDailyAverageMinutes: 60,
    },
  ].map((row) => ({ ...row, mediaId: null }));
  const rows = rankScreenTime(values);
  expect(rows.map((r) => [r.userId, r.rank, r.improvement])).toEqual([
    ["b", 1, 30],
    ["c", 1, null],
    ["d", 3, -30],
    ["a", null, null],
  ]);
  expect(values[0].userId).toBe("a");
  expect(formatScreenTime(0)).toBe("0m");
  expect(formatScreenTime(125)).toBe("2h 5m");
});
