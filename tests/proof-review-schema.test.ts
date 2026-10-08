import { expect, test } from "bun:test";
import { proofReviewSchema } from "@/lib/schemas";

test("approvals and challenges both require a nonblank comment", () => {
  for (const decision of ["APPROVED", "CHALLENGED"]) {
    for (const note of [undefined, "", "   ", "x".repeat(501)])
      expect(proofReviewSchema.safeParse({ decision, note }).success).toBe(
        false,
      );
    expect(
      proofReviewSchema.parse({ decision, note: " Looks right " }).note,
    ).toBe("Looks right");
  }
});
