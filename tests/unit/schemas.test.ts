import { describe, expect, test } from "bun:test";
import { proofReviewSchema, socialReplySchema } from "@/lib/schemas";

describe("proof review validation", () => {
  test("allows approval without performative paperwork", () => {
    expect(proofReviewSchema.safeParse({ decision: "APPROVED" }).success).toBe(
      true,
    );
  });

  test("requires a useful challenge note", () => {
    expect(
      proofReviewSchema.safeParse({ decision: "CHALLENGED", note: "" }).success,
    ).toBe(false);
    expect(
      proofReviewSchema.safeParse({
        decision: "CHALLENGED",
        note: "The photo cuts off the completed problems.",
      }).success,
    ).toBe(true);
  });
});

describe("social reply validation", () => {
  test("accepts a useful reply to a task or check-in", () => {
    expect(
      socialReplySchema.safeParse({
        targetType: "COMMITMENT",
        targetId: "task-1",
        body: "Text her back. Worst case: character development.",
      }).success,
    ).toBe(true);
    expect(
      socialReplySchema.safeParse({
        targetType: "CHECK_IN",
        targetId: "check-in-1",
        body: "Do it.",
      }).success,
    ).toBe(true);
  });

  test("rejects empty, oversized, and unknown-target replies", () => {
    expect(
      socialReplySchema.safeParse({
        targetType: "CHECK_IN",
        targetId: "check-in-1",
        body: "   ",
      }).success,
    ).toBe(false);
    expect(
      socialReplySchema.safeParse({
        targetType: "PROOF",
        targetId: "proof-1",
        body: "Nice.",
      }).success,
    ).toBe(false);
    expect(
      socialReplySchema.safeParse({
        targetType: "COMMITMENT",
        targetId: "task-1",
        body: "a".repeat(501),
      }).success,
    ).toBe(false);
  });
});
