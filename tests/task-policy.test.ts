import { expect, test } from "bun:test";
import {
  canEditTask,
  currentTaskFilter,
  proofApprovalProgress,
  requiredApprovalsForCircle,
  shouldMarkMissed,
  taskDeadline,
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

test("late-night tasks keep their full 24 hours across midnight", () => {
  const created = new Date("2026-09-17T06:00:00Z"); // 11 pm Phoenix
  const due = taskDeadline(created);
  expect(due.toISOString()).toBe("2026-09-18T06:00:00.000Z");
  expect(canEditTask(due, new Date("2026-09-17T16:00:00Z"))).toBe(true);
  expect(canEditTask(due, due)).toBe(false);
  expect(
    shouldMarkMissed("OPEN", due, 0, new Date("2026-09-17T16:00:00Z")),
  ).toBe(false);
  expect(currentTaskFilter(created).OR[0]).toEqual({ dueAt: { gt: created } });
});
