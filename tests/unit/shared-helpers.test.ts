import { describe, expect, test } from "bun:test";
import { activityIcon } from "@/components/layout/activity-icons";
import { getInitials } from "@/lib/names";
import {
  formatHistoryTime,
  formatProofTime,
  formatReplyTime,
} from "@/lib/time";

describe("getInitials", () => {
  test("uses first letters of first two words", () => {
    expect(getInitials("Zayd Krunz")).toBe("ZK");
    expect(getInitials("  mia  ")).toBe("M");
  });

  test("falls back to PB on blank names", () => {
    expect(getInitials("")).toBe("PB");
    expect(getInitials("   ")).toBe("PB");
  });
});

describe("activityIcon", () => {
  test("covers every activity kind including invites", () => {
    for (const kind of [
      "TASK_CREATED",
      "TASK_RENEGOTIATED",
      "TASK_MISSED",
      "PROOF_SUBMITTED",
      "PROOF_APPROVED",
      "PROOF_CHALLENGED",
      "CHECK_IN_SET",
      "REPLY_POSTED",
      "INVITE_CREATED",
      "INVITE_REVOKED",
      "SOMETHING_NEW",
    ]) {
      expect(activityIcon(kind)).toBeDefined();
    }
  });
});

describe("phoenix formatters", () => {
  test("format the same instant consistently", () => {
    const date = new Date("2026-09-03T19:00:00.000Z");
    expect(formatReplyTime(date)).toContain("Sep");
    expect(formatHistoryTime(date)).toMatch(/\d{1,2}:\d{2}/);
    expect(formatProofTime(date)).toContain("26");
  });

  test("accept ISO strings as well as Dates", () => {
    const iso = "2026-09-03T19:00:00.000Z";
    expect(formatReplyTime(iso)).toBe(formatReplyTime(new Date(iso)));
  });
});
