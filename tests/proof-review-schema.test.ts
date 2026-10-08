import { expect, test } from "bun:test";
import { proofReviewSchema } from "@/lib/schemas";

test("approvals allow omitted, blank, or optional comments", () => {
  for (const note of [undefined, "", "   ", "Looks good"]) {
    expect(
      proofReviewSchema.safeParse({ decision: "APPROVED", note }).success,
    ).toBe(true);
  }
});

test("challenges require a nonblank reason and all notes keep the length limit", () => {
  for (const note of [undefined, "", "   "]) {
    expect(
      proofReviewSchema.safeParse({ decision: "CHALLENGED", note }).success,
    ).toBe(false);
  }
  expect(
    proofReviewSchema.parse({ decision: "CHALLENGED", note: " Missing page " })
      .note,
  ).toBe("Missing page");
  for (const decision of ["APPROVED", "CHALLENGED"]) {
    expect(
      proofReviewSchema.safeParse({ decision, note: "x".repeat(501) }).success,
    ).toBe(false);
  }
});
