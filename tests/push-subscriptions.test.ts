import { beforeEach, expect, mock, test } from "bun:test";
import { Prisma } from "@/generated/prisma/client";

mock.module("server-only", () => ({}));
const updateMany = mock(async (): Promise<{ count: number }> => ({ count: 1 }));
const create = mock(async (): Promise<unknown> => ({}));
mock.module("@/lib/prisma", () => ({
  getPrisma: () => ({ pushSubscription: { updateMany, create } }),
}));
mock.module("@/lib/rate-limit", () => ({ limitAction: async () => {} }));
mock.module("@/lib/request", () => ({
  hasSameOrigin: () => true,
  getRequestMembership: async () => ({
    session: { user: { id: "me" } },
    membership: { circleId: "circle" },
  }),
}));
const { POST } = await import("@/app/api/push/subscriptions/route");

const body = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "public-key", auth: "auth-secret" },
};
const subscribe = () =>
  POST(
    new Request("http://localhost/api/push/subscriptions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  updateMany.mockClear();
  create.mockClear();
});

test("an endpoint moves only to its owner or a caller holding its keys", async () => {
  expect((await subscribe()).status).toBe(201);
  expect(updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        endpoint: body.endpoint,
        OR: [
          { userId: "me" },
          { p256dh: body.keys.p256dh, auth: body.keys.auth },
        ],
      },
    }),
  );
  expect(create).not.toHaveBeenCalled();
});

test("new endpoints are created for the caller", async () => {
  updateMany.mockResolvedValueOnce({ count: 0 });
  expect((await subscribe()).status).toBe(201);
  expect(create).toHaveBeenCalledWith({
    data: expect.objectContaining({ endpoint: body.endpoint, userId: "me" }),
  });
});

test("another account's endpoint cannot be claimed without its keys", async () => {
  updateMany.mockResolvedValueOnce({ count: 0 });
  create.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    }),
  );
  expect((await subscribe()).status).toBe(409);
});
