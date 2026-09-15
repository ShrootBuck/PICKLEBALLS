import { expect, test } from "bun:test";
import {
  proofApprovalProgress,
  requiredApprovalsForCircle,
} from "@/lib/task-policy";

test("solo, pair, and larger groups require every peer", () => {
  expect([0, 1, 2, 4, 12].map(requiredApprovalsForCircle)).toEqual([
    0, 0, 1, 3, 11,
  ]);
});

test("only distinct approvals from current peers count", () => {
  expect(
    proofApprovalProgress(
      "owner",
      ["owner", "a", "b", "c"],
      [
        { reviewerId: "owner", decision: "APPROVED" },
        { reviewerId: "departed", decision: "APPROVED" },
        { reviewerId: "a", decision: "APPROVED" },
        { reviewerId: "a", decision: "APPROVED" },
        { reviewerId: "b", decision: "CHALLENGED" },
      ],
    ),
  ).toEqual({ approvalCount: 1, requiredApprovals: 3 });
});
