import { describe, expect, test } from "bun:test";
import { proofReviewSchema } from "@/lib/schemas";

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
