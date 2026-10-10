import { afterAll, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("Use bun run test:social. Disposable Postgres is required.");
mock.module("server-only", () => ({}));
const { getPrisma } = await import("@/lib/prisma");
const {
  startWorkSession,
  stopWorkSession,
  editWorkSession,
  getActiveWorkSession,
  listWorkSessions,
} = await import("@/lib/work-sessions");
const { deleteContent, changeCircleLifecycle } = await import(
  "@/lib/deletions"
);
const { removeCircleMember } = await import("@/lib/circles");
const { submitProof } = await import("@/lib/tasks");
const { queueProof } = await import("@/lib/pending-proof");
const db = getPrisma();
const cleanup: string[] = [];
const circles: string[] = [];
const started = new Date(Date.now() - 3 * 3600_000);
const minute = (offset: number) =>
  new Date(started.getTime() + offset * 60_000);

async function fixture() {
  const owner = `work-owner-${randomUUID()}`;
  const member = `work-member-${randomUUID()}`;
  const outsider = `work-outsider-${randomUUID()}`;
  cleanup.push(owner, member, outsider);
  await db.user.createMany({
    data: [owner, member, outsider].map((id) => ({
      id,
      email: `${id}@example.invalid`,
      name: id,
    })),
  });
  const circle = await db.circle.create({
    data: { name: "Work sessions", slug: `work-${randomUUID()}` },
  });
  circles.push(circle.id);
  await db.membership.createMany({
    data: [
      { userId: owner, circleId: circle.id, role: "OWNER" },
      { userId: member, circleId: circle.id },
    ],
  });
  const task = await newTask(member, circle.id);
  return { owner, member, outsider, circleId: circle.id, task };
}
async function newTask(userId: string, circleId: string) {
  return db.commitment.create({
    data: {
      userId,
      circleId,
      title: "Physics homework",
      day: started,
      createdAt: started,
      dueAt: new Date(started.getTime() + 86400_000),
      requiredApprovals: 1,
    },
  });
}
async function start(
  f: Awaited<ReturnType<typeof fixture>>,
  taskId = f.task.id,
  at = started,
  id = randomUUID(),
) {
  return startWorkSession(
    f.member,
    f.circleId,
    { id, taskId, circleId: f.circleId },
    at,
  );
}
async function attachment(
  f: Awaited<ReturnType<typeof fixture>>,
  video = false,
) {
  const id = `${video ? "v" : "i"}_${randomUUID()}`;
  await db.mediaUpload.create({
    data: {
      id,
      ownerId: f.member,
      circleId: f.circleId,
      objectKey: `media/${id}`,
      mimeType: video ? "video/mp4" : "image/webp",
      sizeBytes: 100,
      ready: true,
      uploadedAt: started,
    },
  });
  return id;
}

test("start/stop retries are idempotent and a resumed task records a separate interval", async () => {
  const f = await fixture();
  const id = randomUUID();
  const first = await start(f, f.task.id, started, id);
  expect((await start(f, f.task.id, minute(1), id)).startedAt).toBe(
    first.startedAt,
  );
  expect((await getActiveWorkSession(f.member))?.id).toBe(id);
  const stopped = await stopWorkSession(f.member, id, minute(25));
  expect((await stopWorkSession(f.member, id, minute(40))).endedAt).toBe(
    stopped.endedAt,
  );
  expect((await start(f, f.task.id, minute(40), id)).endedAt).toBe(
    stopped.endedAt,
  );
  const second = await start(f, f.task.id, minute(40));
  await stopWorkSession(f.member, second.id, minute(70));
  const sessions = await listWorkSessions(f.member, f.circleId, f.task.id);
  expect(sessions).toHaveLength(2);
  expect(
    sessions.reduce(
      (sum, session) =>
        sum +
        Date.parse(session.endedAt as string) -
        Date.parse(session.startedAt),
      0,
    ),
  ).toBe(55 * 60_000);
  expect(await getActiveWorkSession(f.member)).toBeNull();
});

test("concurrent starts and different circles still permit only one running stopwatch", async () => {
  const f = await fixture();
  const other = await newTask(f.member, f.circleId);
  const results = await Promise.allSettled([start(f), start(f, other.id)]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    await db.workSession.count({ where: { userId: f.member, endedAt: null } }),
  ).toBe(1);
  const secondCircle = await db.circle.create({
    data: { name: "Another circle", slug: randomUUID() },
  });
  circles.push(secondCircle.id);
  await db.membership.create({
    data: { userId: f.member, circleId: secondCircle.id },
  });
  const secondTask = await newTask(f.member, secondCircle.id);
  await expect(
    startWorkSession(
      f.member,
      secondCircle.id,
      { id: randomUUID(), taskId: secondTask.id, circleId: secondCircle.id },
      minute(1),
    ),
  ).rejects.toThrow("Stop your current stopwatch");
  // The database enforces the running-slot invariant even outside the service.
  await expect(
    Promise.resolve(
      db.workSession.create({
        data: {
          id: randomUUID(),
          userId: f.member,
          circleId: f.circleId,
          commitmentId: f.task.id,
          startedAt: started,
        },
      }),
    ),
  ).rejects.toThrow();
});

test("ownership, membership and closed tasks are enforced for every operation", async () => {
  const f = await fixture();
  const session = await start(f);
  await expect(stopWorkSession(f.owner, session.id)).rejects.toThrow(
    "Session not found",
  );
  await expect(
    listWorkSessions(f.owner, f.circleId, f.task.id),
  ).rejects.toThrow("Task not found");
  await expect(
    startWorkSession(f.outsider, f.circleId, {
      id: randomUUID(),
      taskId: f.task.id,
      circleId: f.circleId,
    }),
  ).rejects.toThrow("member");
  await expect(
    startWorkSession(f.member, "wrong-circle", {
      id: randomUUID(),
      taskId: f.task.id,
      circleId: f.circleId,
    }),
  ).rejects.toThrow("circle changed");
  await stopWorkSession(f.member, session.id, minute(20));
  for (const status of [
    "VERIFIED",
    "MISSED",
    "CANCELLED",
    "AWAITING_REVIEW",
  ] as const) {
    await db.commitment.update({
      where: { id: f.task.id },
      data: {
        status,
        proofSubmittedAt: status === "AWAITING_REVIEW" ? started : null,
      },
    });
    await expect(start(f)).rejects.toThrow("no longer open");
  }
  await db.commitment.update({
    where: { id: f.task.id },
    data: { status: "OPEN", proofSubmittedAt: null, dueAt: minute(1) },
  });
  await expect(start(f, f.task.id, minute(2))).rejects.toThrow(
    "no longer open",
  );
});

test("corrections reject stale writes, overlaps, invalid times and edits to running sessions", async () => {
  const f = await fixture();
  const first = await start(f);
  const edit = (
    session: typeof first,
    from: Date,
    to: Date,
    userId = f.member,
  ) =>
    editWorkSession(
      userId,
      session.id,
      {
        startedAt: from.toISOString(),
        endedAt: to.toISOString(),
        updatedAt: session.updatedAt,
      },
      minute(100),
    );
  await expect(edit(first, started, minute(20))).rejects.toThrow(
    "Stop the stopwatch",
  );
  const stopped = await stopWorkSession(f.member, first.id, minute(20));
  await expect(edit(stopped, started, minute(20), f.owner)).rejects.toThrow(
    "Session not found",
  );
  const corrected = await edit(stopped, minute(1), minute(21));
  await expect(edit(stopped, started, minute(25))).rejects.toThrow(
    "changed on another device",
  );
  await expect(edit(corrected, minute(30), minute(10))).rejects.toThrow(
    "after the start",
  );
  await expect(edit(corrected, minute(1), minute(101))).rejects.toThrow(
    "future",
  );
  const next = await start(f, f.task.id, minute(40));
  await expect(edit(corrected, minute(1), minute(45))).rejects.toThrow(
    "overlaps",
  );
  await stopWorkSession(f.member, next.id, minute(50));
});

test("proof uses recorded times and cannot be posted while work is running", async () => {
  const f = await fixture();
  const image = await attachment(f);
  const first = await start(f);
  await expect(
    submitProof(
      f.task.id,
      f.member,
      f.circleId,
      [image],
      null,
      minute(2),
      minute(5),
      minute(30),
    ),
  ).rejects.toThrow("Stop your stopwatch");
  await stopWorkSession(f.member, first.id, minute(25));
  const second = await start(f, f.task.id, minute(40));
  await stopWorkSession(f.member, second.id, minute(70));
  const proof = await submitProof(
    f.task.id,
    f.member,
    f.circleId,
    [image],
    null,
    minute(2),
    minute(5),
    minute(80),
  );
  expect(proof.startedAt).toEqual(started);
  expect(proof.completedAt).toEqual(minute(70));
  await expect(start(f, f.task.id, minute(90))).rejects.toThrow(
    "no longer open",
  );
  const legacy = await db.taskProof.findMany({
    where: {
      id: proof.id,
      commitment: { workSessions: { none: { endedAt: { not: null } } } },
    },
  });
  expect(legacy).toHaveLength(0);
  expect(
    await db.workSession.count({ where: { commitmentId: f.task.id } }),
  ).toBe(2);
});

test("queued video proof captures recorded times and prevents starting another interval", async () => {
  const f = await fixture();
  const video = await attachment(f, true);
  const session = await start(f);
  await stopWorkSession(f.member, session.id, minute(25));
  const queued = await queueProof(
    f.task.id,
    f.member,
    f.circleId,
    [video],
    null,
    minute(1),
    minute(2),
    minute(30),
  );
  expect(queued.startedAt).toEqual(started);
  expect(queued.completedAt).toEqual(minute(25));
  await expect(start(f, f.task.id, minute(40))).rejects.toThrow(
    "proof processing",
  );
  const stopped = (await listWorkSessions(f.member, f.circleId, f.task.id))[0];
  await editWorkSession(
    f.member,
    stopped.id,
    {
      startedAt: minute(1).toISOString(),
      endedAt: minute(24).toISOString(),
      updatedAt: stopped.updatedAt,
    },
    minute(40),
  );
  const proof = await submitProof(
    f.task.id,
    f.member,
    f.circleId,
    [video],
    null,
    queued.startedAt,
    queued.completedAt,
    minute(45),
    queued.id,
  );
  expect(proof.startedAt).toEqual(started);
  expect(proof.completedAt).toEqual(minute(25));
});

test("cancellation and leaving or removal close active sessions without deleting the recorded work", async () => {
  const cancelled = await fixture();
  const session = await start(cancelled);
  await deleteContent(
    "task",
    cancelled.task.id,
    cancelled.member,
    cancelled.circleId,
  );
  expect(await getActiveWorkSession(cancelled.member)).toBeNull();
  expect(
    (await db.workSession.findUniqueOrThrow({ where: { id: session.id } }))
      .endedAt,
  ).not.toBeNull();
  const leaving = await fixture();
  const leaveSession = await start(leaving);
  await changeCircleLifecycle(leaving.member, leaving.circleId, "leave");
  expect(await getActiveWorkSession(leaving.member)).toBeNull();
  expect(await db.workSession.count({ where: { id: leaveSession.id } })).toBe(
    1,
  );
  await expect(
    listWorkSessions(leaving.member, leaving.circleId, leaving.task.id),
  ).rejects.toThrow();
  const removed = await fixture();
  const removedSession = await start(removed);
  await removeCircleMember(removed.member, removed.circleId, removed.owner);
  expect(await getActiveWorkSession(removed.member)).toBeNull();
  expect(await db.workSession.count({ where: { id: removedSession.id } })).toBe(
    1,
  );
});

afterAll(async () => {
  await db.circle.deleteMany({ where: { id: { in: circles } } });
  await db.user.deleteMany({ where: { id: { in: cleanup } } });
  await db.$disconnect();
});
