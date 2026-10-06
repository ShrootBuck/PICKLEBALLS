import { expect, test } from "bun:test";
import { proofChallengeSchema } from "@/lib/schemas";
import {
  canChallengeProof,
  canEditTask,
  canSubmitProof,
  challengeDeadline,
  currentTaskFilter,
  shouldMarkMissed,
  taskDeadline,
} from "@/lib/task-policy";

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
    OR: [
      { dueAt: { gt: created } },
      {
        proofSubmittedAt: { not: null },
        status: { in: ["OPEN", "RENEGOTIATED"] },
      },
    ],
  });
});

test("only tasks without proof are missed at the deadline", () => {
  const due = taskDeadline(new Date("2026-09-20T20:15:00Z"));
  for (const status of ["OPEN", "RENEGOTIATED"]) {
    expect(shouldMarkMissed(status, due, new Date(due.getTime() - 1))).toBe(
      false,
    );
    expect(shouldMarkMissed(status, due, due)).toBe(true);
  }
  expect(shouldMarkMissed("DONE", due, new Date(due.getTime() + 1))).toBe(
    false,
  );
  expect(shouldMarkMissed("MISSED", due, due)).toBe(false);
  // A challenge reopens the task, but on-time proof never turns into a miss.
  expect(
    shouldMarkMissed("OPEN", due, new Date("2027-01-01"), new Date(due)),
  ).toBe(false);
});

test("done tasks take no more proof; challenged tasks take a replacement", () => {
  const dueAt = new Date("2026-10-02T00:00:00Z");
  const after = new Date("2026-10-03T00:00:00Z");
  expect(canSubmitProof({ dueAt, status: "DONE" }, after)).toBe(false);
  expect(canSubmitProof({ dueAt, status: "MISSED" }, after)).toBe(false);
  expect(canSubmitProof({ dueAt, status: "OPEN" }, after)).toBe(false);
  expect(
    canSubmitProof({ dueAt, status: "OPEN", proofSubmittedAt: dueAt }, after),
  ).toBe(true);
});

test("friends can challenge standing proof for 24 hours after it posts", () => {
  const submittedAt = new Date("2026-10-01T12:00:00Z");
  const proof = {
    ownerId: "owner",
    submittedAt,
    isLate: false,
    replacedById: null,
    challenged: false,
    taskStatus: "DONE",
  };
  const end = challengeDeadline(submittedAt);
  const before = new Date(end.getTime() - 1);
  expect(end.toISOString()).toBe("2026-10-02T12:00:00.000Z");
  expect(canChallengeProof(proof, "friend", before)).toBe(true);
  expect(canChallengeProof(proof, "friend", end)).toBe(false);
  expect(canChallengeProof(proof, "owner", before)).toBe(false);
  for (const change of [
    { challenged: true },
    { replacedById: "newer" },
    { isLate: true },
    { taskStatus: "MISSED" },
    { taskStatus: "OPEN" },
  ])
    expect(canChallengeProof({ ...proof, ...change }, "friend", before)).toBe(
      false,
    );
});

test("challenges need a nonblank reason within the length limit", () => {
  for (const reason of [undefined, "", "   ", "x".repeat(501)])
    expect(proofChallengeSchema.safeParse({ reason }).success).toBe(false);
  expect(proofChallengeSchema.parse({ reason: " Missing page " }).reason).toBe(
    "Missing page",
  );
});
