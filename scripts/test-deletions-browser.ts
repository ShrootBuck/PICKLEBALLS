import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { phoenixDateKey, requireDateKey } from "../lib/time";

Object.assign(
  process.env,
  JSON.parse(readFileSync("/private/tmp/pb-social-test-env.json", "utf8")),
);
if (
  process.env.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(process.env.DATABASE_URL || "http://invalid").hostname !== "127.0.0.1"
)
  throw new Error("Start bun run test:social --serve first.");
const { getPrisma } = await import("../lib/prisma");
const db = getPrisma();
const prefix = `delete-ui-${randomUUID()}`;
const owner = `${prefix}-owner`,
  member = `${prefix}-member`;
await db.user.createMany({
  data: [
    { id: owner, name: "Deletion Owner", email: `${owner}@example.invalid` },
    { id: member, name: "Deletion Friend", email: `${member}@example.invalid` },
  ],
});
const circle = await db.circle.create({
  data: { slug: prefix, name: "Lifecycle test circle" },
});
await db.membership.createMany({
  data: [
    { userId: owner, circleId: circle.id, role: "OWNER" },
    { userId: member, circleId: circle.id },
  ],
});
const goal = await db.goal.create({
  data: { userId: owner, circleId: circle.id, title: "Delete this goal" },
});
const task = await db.commitment.create({
  data: {
    userId: owner,
    circleId: circle.id,
    title: "Cancel this commitment",
    day: requireDateKey(phoenixDateKey()),
    dueAt: new Date(Date.now() + 86400_000),
    goalId: goal.id,
  },
});
const origin = "http://localhost:3317";
async function session(userId: string, old = false) {
  const token = randomUUID();
  await db.session.create({
    data: {
      id: randomUUID(),
      userId,
      token,
      createdAt: new Date(Date.now() - (old ? 3600_000 : 0)),
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET || "")
    .update(token)
    .digest("base64");
  return {
    name: "pickle-balls.session_token",
    value: encodeURIComponent(`${token}.${signature}`),
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
  };
}
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const cookie = await session(owner);
const secondCookie = await session(owner);
const oldCookie = await session(owner, true);
await context.addCookies([
  cookie,
  {
    name: "pb_active_circle",
    value: circle.id,
    domain: "localhost",
    path: "/",
  },
]);
context.setDefaultTimeout(20_000);
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
async function call(
  path: string,
  method: string,
  body: unknown,
  authCookie = cookie,
  requestOrigin = origin,
) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      cookie: `${authCookie.name}=${authCookie.value}; pb_active_circle=${circle.id}`,
      origin: requestOrigin,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
try {
  assert.equal(
    (
      await call(
        "/api/account",
        "DELETE",
        { confirmation: "DELETE" },
        cookie,
        "https://evil.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/api/account",
        "DELETE",
        { confirmation: "DELETE" },
        oldCookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("/api/account", "DELETE", { confirmation: "DELETE" })).status,
    409,
  );
  assert.equal(
    (
      await call(`/api/content/goal/${goal.id}`, "DELETE", {
        circleId: "stale-circle",
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(`/api/circles/${circle.id}`, "PATCH", { action: "bogus" }))
      .status,
    400,
  );
  const peerCookie = await session(member);
  assert.equal(
    (
      await call(
        `/api/content/goal/${goal.id}`,
        "DELETE",
        { circleId: circle.id },
        peerCookie,
      )
    ).status,
    404,
  );
  await page.goto(`${origin}/goals/${goal.id}`);
  await page.getByRole("button", { name: "Delete goal", exact: true }).click();
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Delete goal", exact: true })
    .click();
  await page.waitForURL(`${origin}/goals`);
  assert.equal(await db.goal.findUnique({ where: { id: goal.id } }), null);
  assert.equal(
    (await db.commitment.findUniqueOrThrow({ where: { id: task.id } })).goalId,
    null,
  );
  await page.goto(`${origin}/profile?tab=tasks`);
  const article = page.locator(`#task-${task.id}`);
  await article
    .getByRole("button", { name: "Cancel task", exact: true })
    .click();
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Cancel task", exact: true })
    .click();
  await page
    .locator('[data-slot="dialog-content"]')
    .waitFor({ state: "hidden" });
  assert.equal(
    (await db.commitment.findUniqueOrThrow({ where: { id: task.id } })).status,
    "CANCELLED",
  );
  // Check-in deletion from the post menu must remove its visible cached feed entry.
  const parent = await db.checkIn.create({
    data: {
      userId: owner,
      circleId: circle.id,
      day: requireDateKey(phoenixDateKey()),
      signal: "YAY",
    },
  });
  const update = await db.checkInUpdate.create({
    data: {
      checkInId: parent.id,
      userId: owner,
      circleId: circle.id,
      day: requireDateKey(phoenixDateKey()),
      signal: "YAY",
      journal: "Remove this private check-in",
    },
  });
  await page.goto(origin);
  const post = page.getByRole("article", {
    name: "Deletion Owner’s check-in",
    exact: true,
  });
  await post.getByRole("button", { name: "Post options" }).click();
  await page.getByRole("menuitem", { name: "Delete post" }).click();
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Delete post", exact: true })
    .click();
  await page
    .locator('[data-slot="dialog-content"]')
    .waitFor({ state: "hidden" });
  await post.waitFor({ state: "hidden" });
  assert.equal(
    await db.checkInUpdate.findUnique({ where: { id: update.id } }),
    null,
  );
  await page.goto(`${origin}/circles`);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/private/tmp/pb-deletion-circles-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "/private/tmp/pb-deletion-circles-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Delete circle", exact: true })
    .click();
  assert.equal(
    await page
      .locator('[data-slot="dialog-content"]')
      .getByRole("button", { name: "Delete circle", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Go back" })
    .click();
  await page
    .getByRole("button", { name: "Transfer ownership", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Make Deletion Friend owner", exact: true })
    .click();
  await page
    .locator('[data-slot="dialog-content"]')
    .last()
    .getByRole("button", { name: "Make Deletion Friend owner", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Leave circle", exact: true })
    .waitFor();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Leave circle", exact: true }).click();
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Leave circle", exact: true })
    .click();
  await page.getByText("No circles yet", { exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  assert.equal(
    await dialog
      .getByRole("button", { name: "Delete account", exact: true })
      .isDisabled(),
    true,
  );
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.screenshot({
    path: "/private/tmp/pb-deletion-account-mobile.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page.waitForURL(`${origin}/sign-in`);
  assert.equal(await db.user.findUnique({ where: { id: owner } }), null);
  assert.equal(
    (
      await call(
        "/api/account",
        "DELETE",
        { confirmation: "DELETE" },
        secondCookie,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await db.membership.findUniqueOrThrow({
        where: { userId_circleId: { userId: member, circleId: circle.id } },
      })
    ).role,
    "OWNER",
  );
  const deletedCircle = await call(
    `/api/circles/${circle.id}`,
    "PATCH",
    { action: "delete", confirmation: circle.name },
    peerCookie,
  );
  assert.equal(deletedCircle.status, 200, await deletedCircle.text());
  assert.equal(await db.circle.findUnique({ where: { id: circle.id } }), null);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Deletion UI and HTTP checks passed: mobile layout, goal, task, post menu, ownership transfer, leave, circle delete, account delete, expired/cross-origin/foreign requests, and all-session invalidation.",
  );
} catch (error) {
  await page.screenshot({
    path: "/private/tmp/pb-deletion-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  await db.$disconnect();
}
