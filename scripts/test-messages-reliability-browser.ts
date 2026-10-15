// Run against disposable accounts: bun run test:fixture --video.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type {
  DirectMessageItem,
  DirectThread,
} from "@/lib/direct-message-types";
import { fixtureEnvironment, launchFixtureBrowser } from "./browser-fixture";

const app = "http://localhost:3317";
const browser = await launchFixtureBrowser();
try {
  const you = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  const eddie = await browser.newContext({ serviceWorkers: "block" });
  const page = await you.newPage();
  const peer = await eddie.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3318/login");
  await peer.goto("http://localhost:3318/login?user=eddie");
  await page.waitForTimeout(1500);
  const inbox = await (await you.request.get(`${app}/api/messages`)).json();
  const id = inbox.conversations.find(
    (chat: { person: { id: string } | null }) =>
      chat.person?.id === "demo-eddie",
  ).id;
  await page.goto(`${app}/messages?chat=${id}`);
  const composer = page.getByRole("textbox", {
    name: "Message Eddie",
    exact: true,
  });
  await composer.waitFor();
  await page.bringToFront();
  const row = (body: string) =>
    page
      .locator('[data-message-id]:not([data-message-id^="pending-"])')
      .filter({ has: page.getByText(body, { exact: true }) });
  const send = async (body: string) => {
    await composer.fill(body);
    await composer.press("Enter");
    await row(body).waitFor();
  };
  const thread = async (): Promise<DirectThread> =>
    (await you.request.get(`${app}/api/messages/${id}`)).json();
  const prefix = randomUUID().slice(0, 8);

  const seenBody = `${prefix} already read`;
  await send(seenBody);
  const seenMessage = (await thread()).messages.find(
    (message) => message.body === seenBody,
  );
  assert.ok(seenMessage);
  await eddie.request.patch(`${app}/api/messages/${id}`, {
    headers: { origin: app },
    data: { through: seenMessage.sequence },
  });
  await row(seenBody).getByText("Seen", { exact: true }).waitFor();

  // Hold the first send until all three Enter gestures have happened.
  let releaseFirst!: () => void;
  let requestStarted!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  const bodies = [1, 2, 3].map((number) => `${prefix} rapid ${number}`);
  const attempted: string[] = [];
  await page.route(`**/api/messages/${id}`, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON().body;
      attempted.push(body);
      if (body === bodies[0]) {
        requestStarted();
        await held;
      }
    }
    await route.continue();
  });
  await composer.fill(bodies[0]);
  await composer.press("Enter");
  await started;
  for (const body of bodies.slice(1)) {
    assert.equal(
      await composer.evaluate((element) => document.activeElement === element),
      true,
      "Sending must preserve focus",
    );
    await page.keyboard.type(body);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type(`${prefix} next unsent draft`);
  assert.deepEqual(attempted, [bodies[0]]);
  assert.equal(await page.locator('[data-send-state="queued"]').count(), 2);
  releaseFirst();
  for (const body of bodies) await row(body).waitFor();
  assert.deepEqual(attempted, bodies);
  assert.equal(await composer.inputValue(), `${prefix} next unsent draft`);
  assert.equal(
    await composer.evaluate((element) => document.activeElement === element),
    true,
  );
  await row(seenBody).getByText("Seen", { exact: true }).waitFor();
  await row(bodies[2]).getByText("Sent", { exact: true }).waitFor();
  const sent = (await thread()).messages.filter((message) =>
    bodies.includes(message.body),
  );
  assert.deepEqual(
    sent.map((message) => message.body),
    bodies,
  );
  await page.unroute(`**/api/messages/${id}`);

  // Drafts survive chat changes, leaving Messages, and a full reload.
  await page
    .getByRole("navigation", { name: "Conversations", exact: true })
    .getByRole("link")
    .filter({ hasText: "Sam" })
    .click();
  await page
    .getByRole("textbox", { name: "Message Sam", exact: true })
    .fill(`${prefix} Sam's draft`);
  await page
    .getByRole("navigation", { name: "Conversations", exact: true })
    .getByRole("link")
    .filter({ hasText: "Eddie" })
    .click();
  assert.equal(await composer.inputValue(), `${prefix} next unsent draft`);
  await page.getByRole("link", { name: "Feed", exact: true }).first().click();
  await page
    .getByRole("link", { name: /^(Messages|Messages, \d+ unread)$/ })
    .first()
    .click();
  await page
    .getByRole("navigation", { name: "Conversations", exact: true })
    .getByRole("link")
    .filter({ hasText: "Eddie" })
    .click();
  assert.equal(await composer.inputValue(), `${prefix} next unsent draft`);
  await page.reload();
  await composer.waitFor();
  assert.equal(await composer.inputValue(), `${prefix} next unsent draft`);

  // Failed messages live outside the next draft, and a reload preserves retry identity.
  const failedBody = `${prefix} failed send`;
  const retryIds: string[] = [];
  let fail = true;
  await page.route(`**/api/messages/${id}`, async (route) => {
    if (route.request().method() === "POST") {
      retryIds.push(route.request().postDataJSON().clientId);
      if (fail) return route.abort("failed");
    }
    await route.continue();
  });
  await composer.fill(failedBody);
  await composer.press("Enter");
  await page.getByRole("button", { name: "Retry send", exact: true }).waitFor();
  await composer.fill(`${prefix} untouched by failure`);
  await page.reload();
  await composer.waitFor();
  assert.equal(await composer.inputValue(), `${prefix} untouched by failure`);
  await page.getByRole("button", { name: "Retry send", exact: true }).waitFor();
  fail = false;
  await page.getByRole("button", { name: "Retry send", exact: true }).click();
  await row(failedBody).waitFor();
  assert.equal(new Set(retryIds).size, 1);
  assert.equal(await composer.inputValue(), `${prefix} untouched by failure`);
  await page.unroute(`**/api/messages/${id}`);

  // A server commit with a dropped response is reconciled from realtime once, without user retry.
  const lostBody = `${prefix} response lost after commit`;
  await page.route(`**/api/messages/${id}`, async (route) => {
    if (route.request().method() === "POST") {
      assert.equal((await route.fetch()).status(), 201);
      return route.abort("failed");
    }
    await route.continue();
  });
  await send(lostBody);
  await page
    .getByRole("button", { name: "Retry send", exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    (await thread()).messages.filter((message) => message.body === lostBody)
      .length,
    1,
  );
  await page.unroute(`**/api/messages/${id}`);

  // A committed send with a stalled response must not block the next send.
  const stalledBody = `${prefix} stalled response`;
  const afterStall = `${prefix} sent before the response returns`;
  let releaseResponse!: () => void;
  const stalled = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route(`**/api/messages/${id}`, async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().body === stalledBody
    ) {
      assert.equal((await route.fetch()).status(), 201);
      await stalled;
      await route.abort("failed").catch(() => {});
    } else await route.continue();
  });
  await composer.fill(stalledBody);
  await composer.press("Enter");
  await composer.fill(afterStall);
  await composer.press("Enter");
  try {
    await row(afterStall).waitFor({ timeout: 8000 });
  } finally {
    releaseResponse();
  }
  await page.unroute(`**/api/messages/${id}`);

  // Composition confirmation must not send; Shift+Enter remains a newline.
  await composer.fill("first line");
  await composer.press("Shift+Enter");
  await page.keyboard.type("second line");
  assert.equal(await composer.inputValue(), "first line\nsecond line");
  await composer.dispatchEvent("keydown", {
    key: "Enter",
    code: "Enter",
    isComposing: true,
    bubbles: true,
  });
  assert.equal(await composer.inputValue(), "first line\nsecond line");
  await composer.fill("");

  // Seed enough history for multiple pages without exercising the message rate limiter.
  const db = new Client({ connectionString: fixtureEnvironment.DATABASE_URL });
  await db.connect();
  try {
    await db.query("BEGIN");
    const sequence = await db.query(
      'UPDATE "DirectConversation" SET sequence = sequence + 115, revision = revision + 115 WHERE id = $1 RETURNING sequence, revision',
      [id],
    );
    const end = sequence.rows[0];
    await db.query(
      `INSERT INTO "DirectMessage" (id, "conversationId", "senderId", "recipientId", "clientId", sequence, revision, body, "mediaIds", "createdAt")
      SELECT $1 || n, $2, 'demo-eddie', 'demo-you', $1 || n, $3::int - 115 + n, $4::int - 115 + n, $1 || ' history ' || n, ARRAY[]::text[], now() + n * interval '1 second' FROM generate_series(1, 115) n`,
      [prefix, id, end.sequence, end.revision],
    );
    await db.query("COMMIT");
  } finally {
    await db.end();
  }
  await page.reload();
  await composer.waitFor();
  const viewport = page.locator('[data-slot="message-scroller-viewport"]');
  await page
    .locator(".dm-thread")
    .getByText(`${prefix} history 115`, { exact: true })
    .waitFor();
  await viewport.hover();
  await page.mouse.wheel(0, -100_000);
  await page.waitForTimeout(350);
  const anchor = page.getByText(`${prefix} history 66`, { exact: true });
  await anchor.waitFor();
  const before = await anchor.boundingBox();
  assert.ok(before);
  await page
    .getByRole("button", { name: "Load older messages", exact: true })
    .click();
  await page.getByText(`${prefix} history 16`, { exact: true }).waitFor();
  await page.waitForTimeout(350);
  const after = await anchor.boundingBox();
  assert.ok(after);
  assert.ok(
    Math.abs(after.y - before.y) < 12,
    `History load jumped ${after.y - before.y}px`,
  );

  // A new incoming message must not pull someone out of history or be marked seen there.
  const remoteBody = `${prefix} new while reading history`;
  const incoming = await eddie.request.post(`${app}/api/messages/${id}`, {
    headers: { origin: app },
    data: { clientId: randomUUID(), body: remoteBody },
  });
  assert.equal(incoming.status(), 201);
  const remote: DirectMessageItem = (await incoming.json()).message;
  await page
    .locator(`[data-message-id="${remote.id}"]`)
    .waitFor({ state: "attached" });
  const still = await anchor.boundingBox();
  assert.ok(still);
  assert.ok(
    Math.abs(still.y - after.y) < 12,
    "Incoming message stole the scroll position",
  );
  const peerThread: DirectThread = await (
    await eddie.request.get(`${app}/api/messages/${id}`)
  ).json();
  assert.ok(
    peerThread.readThrough < remote.sequence,
    "Offscreen message was falsely marked seen",
  );
  await page
    .getByRole("button", { name: "Jump to latest message", exact: true })
    .click();
  await peer.waitForFunction(
    async ({ id, sequence }) => {
      const response = await fetch(`/api/messages/${id}`);
      return (await response.json()).readThrough === sequence;
    },
    { id, sequence: remote.sequence },
    { timeout: 10_000 },
  );
  await page
    .getByRole("navigation", { name: "Conversations", exact: true })
    .getByRole("link")
    .filter({ hasText: "Eddie" })
    .getByLabel(/unread messages/)
    .waitFor({ state: "hidden", timeout: 10_000 });

  // Recheck constrained layouts with the new composer and queue UI.
  for (const width of [1920, 1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 960 : 844 });
    await composer.waitFor();
    await page.waitForFunction(() => {
      const box = document
        .querySelector(".dm-textarea")
        ?.getBoundingClientRect();
      return (
        box &&
        box.y >= 0 &&
        box.bottom <= innerHeight &&
        box.x >= 0 &&
        box.right <= innerWidth
      );
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const box = await composer.boundingBox();
    assert.ok(
      box && box.y + box.height <= (width >= 768 ? 960 : 844),
      `Composer outside the ${width}px viewport`,
    );
    await page.screenshot({
      path: `/private/tmp/pb-chat-reliability-${width}.png`,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Passed: rapid ordered sends, focus, stable Seen boundary, independent drafts, navigation/reload recovery, failed-send retry identity, lost-response reconciliation, IME/newlines, history anchoring, offscreen read receipts, jump to latest, and 320–1920px layouts.",
  );
} finally {
  await browser.close();
}
