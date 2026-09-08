import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { getPrisma } from "@/lib/prisma";

if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("HTTP checks require the disposable runner.");
const prisma = getPrisma();
const origin = "http://localhost:3317";
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) throw new Error("Missing test secret");
function cookie(userId: string, circleId: string) {
  const token = `http-${userId}`;
  const sig = createHmac("sha256", secret || "")
    .update(token)
    .digest("base64");
  return `pickle-balls.session_token=${encodeURIComponent(`${token}.${sig}`)}; pb_active_circle=${circleId}`;
}
for (const userId of ["test-owner", "test-peer", "test-outsider"])
  await prisma.session.upsert({
    where: { token: `http-${userId}` },
    create: {
      id: `http-${userId}`,
      token: `http-${userId}`,
      userId,
      expiresAt: new Date(Date.now() + 3600000),
    },
    update: { expiresAt: new Date(Date.now() + 3600000) },
  });
const mine = cookie("test-owner", "test-circle");
const outside = cookie("test-outsider", "other-circle");
async function get(path: string, session = mine) {
  return fetch(`${origin}${path}`, {
    headers: { cookie: session },
    redirect: "manual",
  });
}
async function put(body: unknown, session = mine, requestOrigin = origin) {
  return fetch(`${origin}/api/likes`, {
    method: "PUT",
    headers: {
      cookie: session,
      origin: requestOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
const proof = await prisma.taskProof.findFirstOrThrow({
  where: { circleId: "test-circle", replacedById: null },
});
assert.equal((await get("/api/feed", "")).status, 401);
assert.equal((await get("/api/feed?memberId=test-outsider")).status, 404);
assert.equal(
  (await get("/api/feed?filter=review&memberId=test-owner")).status,
  400,
);
const data = await (await get("/api/feed")).json();
assert(data.items.length > 0);
assert(
  data.items.every((p: { circleId: string }) => p.circleId === "test-circle"),
);
assert.deepEqual((await (await get("/api/feed", outside)).json()).items, []);
const foreign = await get(
  `/posts/proof/${proof.id}?circle=test-circle`,
  outside,
);
const foreignHtml = await foreign.text();
assert(
  foreign.status === 404 ||
    foreignHtml.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
);
assert(!foreignHtml.includes("Finish physics problems"));
const profile = await get("/members/test-outsider");
const profileHtml = await profile.text();
assert(
  profile.status === 404 ||
    profileHtml.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
);
assert.equal(
  (await get("/api/proofs/demo-proof-0/image", outside)).status,
  404,
);
const like = { targetType: "PROOF", targetId: proof.id, liked: true };
assert.equal((await put(like, mine, "https://untrusted.example")).status, 403);
assert.equal((await put(like, outside)).status, 404);
const once = await (await put(like)).json();
const twice = await (await put(like)).json();
assert.deepEqual(once, twice);
assert(once.likedByMe);
const checkIn = await prisma.checkInUpdate.findFirstOrThrow({
  where: { circleId: "test-circle" },
});
const equal = new Date("2026-09-08T20:00:00Z");
await prisma.socialReply.createMany({
  skipDuplicates: true,
  data: Array.from({ length: 61 }, (_, i) => ({
    id: `http-reply-${String(i).padStart(2, "0")}`,
    authorId: "test-peer",
    circleId: "test-circle",
    checkInUpdateId: checkIn.id,
    body: `Reply ${i}`,
    createdAt: equal,
  })),
});
const query = `/api/replies?targetType=CHECK_IN_UPDATE&targetId=${checkIn.id}`;
const first = await (await get(query)).json();
assert.equal(first.replies.length, 50);
assert(first.hasMore);
const second = await (
  await get(`${query}&before=${first.replies.at(-1).id}`)
).json();
const ids = [...first.replies, ...second.replies].map((r) => r.id);
assert.equal(new Set(ids).size, ids.length);
assert(ids.length >= 61);
assert.deepEqual((await (await get(query, outside)).json()).replies, []);
const canonical = await get(`/squad?focus=${proof.id}&circle=test-circle`);
const canonicalHtml = await canonical.text();
assert(
  canonical.headers.get("location")?.includes(`/posts/proof/${proof.id}`) ||
    canonicalHtml.includes(`/posts/proof/${proof.id}`),
);
await prisma.$disconnect();
console.log(
  "HTTP checks passed: auth, profile/post/media isolation, legacy links, duplicate likes, CSRF, and comment pagination.",
);
