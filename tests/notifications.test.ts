import { afterEach, beforeEach, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
let storedPrefs: Record<string, boolean> | null = null;
const create = mock(async () => ({ id: "notification-1" }));
const findMany = mock(async () => []);
const count = mock(async () => 0);
const updateMany = mock(async () => ({ count: 2 }));
const originalTriggerKey = process.env.TRIGGER_SECRET_KEY;
const triggerPush = mock(async () => ({ id: "run-push" }));
const existingNotification = mock(async () => ({ id: "notification-1" }));
mock.module("@trigger.dev/sdk", () => ({
  tasks: { trigger: triggerPush },
  idempotencyKeys: { create: async (key: string) => key },
}));
const sendPush = mock(async () => {});
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({
    notificationPreference: { findUnique: async () => storedPrefs },
    notification: {
      create,
      findMany,
      count,
      updateMany,
      findUnique: existingNotification,
    },
  }),
}));
mock.module("@/lib/push", () => ({ sendPushToUser: sendPush }));
mock.module("@/lib/request", () => ({
  hasSameOrigin: () => true,
  getRequestMembership: async () => ({
    session: { user: { id: "recipient" } },
    membership: { circleId: "circle" },
  }),
}));
const { createNotificationAndPush } = await import("@/lib/notifications");
const { GET } = await import("@/app/api/notifications/route");
const { POST } = await import("@/app/api/notifications/mark-all-read/route");
const { inboxKinds } = await import("@/lib/notification-policy");
const input = {
  recipientId: "recipient",
  actorId: "actor",
  circleId: "circle",
  title: "Update",
  body: "Details",
};

beforeEach(() => {
  delete process.env.TRIGGER_SECRET_KEY;
  storedPrefs = null;
  for (const fn of [
    create,
    findMany,
    count,
    updateMany,
    sendPush,
    triggerPush,
    existingNotification,
  ])
    fn.mockClear();
});

test("retired task and check-in notices never create rows or pushes, even with old opt-ins", async () => {
  storedPrefs = {
    taskMissed: true,
    taskCreated: true,
    checkIns: true,
    screenTime: true,
    proofsSubmitted: true,
  };
  for (const kind of [
    "TASK_MISSED",
    "TASK_CREATED",
    "TASK_RENEGOTIATED",
    "CHECK_IN_SET",
  ] as const) {
    expect(await createNotificationAndPush({ ...input, kind })).toBeNull();
  }
  expect(create).not.toHaveBeenCalled();
  expect(sendPush).not.toHaveBeenCalled();
});

test("muting photo push keeps the photo in the inbox", async () => {
  storedPrefs = { proofsSubmitted: false, screenTime: true };
  expect(
    await createNotificationAndPush({ ...input, kind: "PROOF_SUBMITTED" }),
  ).toEqual({ id: "notification-1" });
  expect(create).toHaveBeenCalledTimes(1);
  expect(sendPush).not.toHaveBeenCalled();
});

test("direct replies and verdicts always reach inbox and push", async () => {
  storedPrefs = {
    replies: false,
    proofReviews: false,
    proofsSubmitted: false,
    screenTime: false,
  };
  for (const kind of [
    "REPLY_POSTED",
    "PROOF_APPROVED",
    "PROOF_CHALLENGED",
  ] as const) {
    await createNotificationAndPush({ ...input, kind });
  }
  expect(create).toHaveBeenCalledTimes(3);
  expect(sendPush).toHaveBeenCalledTimes(3);
});

test("weekly reminder opt-out prevents both inbox and push", async () => {
  storedPrefs = { proofsSubmitted: true, screenTime: false };
  expect(
    await createNotificationAndPush({
      ...input,
      kind: "SCREEN_TIME_REMINDER",
      actorId: "recipient",
      allowSelf: true,
    }),
  ).toBeNull();
  expect(create).not.toHaveBeenCalled();
  expect(sendPush).not.toHaveBeenCalled();
});

test("screen-time destination retains its week and circle", async () => {
  await createNotificationAndPush({
    ...input,
    kind: "SCREEN_TIME_REMINDER",
    data: { url: "/screen-time?week=2026-08-30" },
    allowSelf: true,
  });
  expect(sendPush).toHaveBeenCalledWith(
    "recipient",
    expect.objectContaining({
      url: "/screen-time?week=2026-08-30&circle=circle",
    }),
  );
});

test("self activity does not notify without explicit reminder permission", async () => {
  expect(
    await createNotificationAndPush({
      ...input,
      actorId: "recipient",
      kind: "REPLY_POSTED",
    }),
  ).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

test("inbox pages, unread count, and mark-all-read share the recipient, circle and kind filter", async () => {
  const response = await GET(
    new Request("http://localhost/api/notifications?cursor=older&unread=1"),
  );
  expect(response.status).toBe(200);
  const where = {
    recipientId: "recipient",
    circleId: "circle",
    kind: { in: inboxKinds },
    readAt: null,
  };
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where,
      cursor: { id: "older" },
      skip: 1,
      take: 31,
    }),
  );
  expect(count).toHaveBeenCalledWith({ where });
  await POST(
    new Request("http://localhost/api/notifications/mark-all-read", {
      method: "POST",
    }),
  );
  expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
});

afterEach(() => {
  if (originalTriggerKey === undefined) delete process.env.TRIGGER_SECRET_KEY;
  else process.env.TRIGGER_SECRET_KEY = originalTriggerKey;
});

test("configured notifications queue push without sending inside the web request", async () => {
  process.env.TRIGGER_SECRET_KEY = "test-key";
  await createNotificationAndPush({ ...input, kind: "REPLY_POSTED" });
  expect(sendPush).not.toHaveBeenCalled();
  expect(triggerPush).toHaveBeenCalledWith(
    "notification",
    { kind: "push", notificationId: "notification-1" },
    { idempotencyKey: "push:notification-1" },
  );
});

test("retry after enqueue failure reuses the inbox row and the same push key", async () => {
  process.env.TRIGGER_SECRET_KEY = "test-key";
  const { Prisma } = await import("@/generated/prisma/client");
  triggerPush.mockRejectedValueOnce(new Error("Unavailable"));
  const notification = {
    ...input,
    kind: "REPLY_POSTED" as const,
    dedupeKey: "reply:1:user",
  };
  await expect(createNotificationAndPush(notification)).rejects.toThrow(
    "Unavailable",
  );
  create.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError("Duplicate", {
      code: "P2002",
      clientVersion: "7",
    }),
  );
  await expect(createNotificationAndPush(notification)).resolves.toEqual({
    id: "notification-1",
  });
  expect(existingNotification).toHaveBeenCalledWith({
    where: { dedupeKey: notification.dedupeKey },
    select: { id: true },
  });
  expect(triggerPush).toHaveBeenCalledTimes(2);
  expect(triggerPush.mock.calls[0]).toEqual(triggerPush.mock.calls[1]);
});
