import { expect, test } from "bun:test";
import {
  canEditTask,
  currentTaskFilter,
  proofApprovalProgress,
  requiredApprovalsForCircle,
  shouldMarkMissed,
  taskDeadline,
} from "@/lib/task-policy";

test("circles require half their members rounded down", () => {
  expect([0, 1, 2, 3, 4, 5, 6, 7, 12].map(requiredApprovalsForCircle)).toEqual([
    0, 0, 1, 1, 2, 2, 3, 3, 6,
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
  ).toEqual({ approvalCount: 1, requiredApprovals: 2 });
});

test("late-night tasks keep their full 24 hours across midnight", () => {
  const created = new Date("2026-09-17T06:00:00Z"); // 11 pm Phoenix
  const due = taskDeadline(created);
  expect(due.toISOString()).toBe("2026-09-18T06:00:00.000Z");
  expect(canEditTask(due, new Date("2026-09-17T16:00:00Z"))).toBe(true);
  expect(canEditTask(due, due)).toBe(false);
  expect(shouldMarkMissed("OPEN", due, new Date("2026-09-17T16:00:00Z"))).toBe(
    false,
  );
  expect(currentTaskFilter(created)).toMatchObject({
    status: { not: "MISSED" },
    OR: [{ dueAt: { gt: created } }, { proofSubmittedAt: { not: null } }],
  });
});

test("the submission deadline never expires pending reviews", () => {
  const due = taskDeadline(new Date("2026-09-20T20:15:00Z"));
  for (const status of ["OPEN", "RENEGOTIATED"]) {
    expect(shouldMarkMissed(status, due, new Date(due.getTime() - 1))).toBe(
      false,
    );
    expect(shouldMarkMissed(status, due, due)).toBe(true);
    expect(
      shouldMarkMissed(status, due, new Date(due.getTime() + 3_600_000)),
    ).toBe(true);
  }
  expect(
    shouldMarkMissed("VERIFIED", due, new Date(due.getTime() + 86_400_000)),
  ).toBe(false);
  expect(shouldMarkMissed("MISSED", due, due)).toBe(false);
});

test("on-time submissions and later challenges never expire", () => {
  const due = new Date("2026-01-01");
  const later = new Date("2027-01-01");
  expect(shouldMarkMissed("AWAITING_REVIEW", due, later)).toBe(false);
  expect(shouldMarkMissed("OPEN", due, later, new Date("2025-12-31"))).toBe(
    false,
  );
});
test("a fixed approval target survives joining and leaving, as do earned approvals", () => {
  const reviews = [{ reviewerId: "departed", decision: "APPROVED" }];
  expect(proofApprovalProgress("owner", ["owner", "new"], reviews, 4)).toEqual({
    approvalCount: 1,
    requiredApprovals: 4,
  });
});
