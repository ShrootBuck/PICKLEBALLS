import { describe, expect, test } from "bun:test";
import {
  proofReviewSchema,
  replyEditSchema,
  socialReplySchema,
} from "@/lib/schemas";
import { canEditReply } from "@/lib/task-policy";

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
  test("accepts replies to tasks, check-ins, proofs, and reviews", () => {
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
    expect(
      socialReplySchema.safeParse({
        targetType: "PROOF",
        targetId: "proof-1",
        body: "Clean solve.",
      }).success,
    ).toBe(true);
    expect(
      socialReplySchema.safeParse({
        targetType: "REVIEW",
        targetId: "review-1",
        body: "Fair. Retaking the photo now.",
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
        targetType: "SPACE",
        targetId: "void-1",
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

describe("reply edit window", () => {
  test("allows edits inside 10 minutes, blocks after", () => {
    const now = new Date("2026-09-02T12:00:00Z");
    expect(canEditReply(new Date("2026-09-02T11:55:00Z"), now)).toBe(true);
    expect(canEditReply(new Date("2026-09-02T11:49:00Z"), now)).toBe(false);
  });

  test("validates edited bodies like new replies", () => {
    expect(replyEditSchema.safeParse({ body: "  fixed typo  " }).success).toBe(
      true,
    );
    expect(replyEditSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(replyEditSchema.safeParse({ body: "a".repeat(501) }).success).toBe(
      false,
    );
  });
});
