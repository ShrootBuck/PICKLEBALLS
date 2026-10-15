// Run against disposable accounts: bun run test:fixture --video.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { fixtureEnvironment, launchFixtureBrowser } from "./browser-fixture";

const browser = await launchFixtureBrowser();
const app = "http://localhost:3317";
const timings: Record<string, number> = {};
const db = new Client({ connectionString: fixtureEnvironment.DATABASE_URL });
await db.connect();
try {
  const you = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  const eddie = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  const page = await you.newPage();
  const peer = await eddie.newPage();
  const errors: string[] = [];
  for (const tab of [page, peer])
    tab.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3318/login");
  await peer.goto("http://localhost:3318/login?user=eddie");
  // Let the initial stream's snapshot reconciliation finish before a hard
  // navigation. WebKit otherwise cancels goto when that RSC response lands.
  await page.waitForTimeout(1500);
  const start = await you.request.post(`${app}/api/messages`, {
    headers: { origin: app },
    data: { recipientId: "demo-eddie" },
  });
  assert.equal(start.status(), 200);
  const { id } = await start.json();
  await page.goto(`${app}/messages?chat=${id}`);
  await peer.goto(`${app}/messages?chat=${id}`);
  for (const tab of [page, peer])
    await tab.locator('[data-realtime-status="live"]').waitFor();
  const composer = page.getByRole("textbox", { name: "Message Eddie" });
  const peerComposer = peer.getByRole("textbox", { name: /^Message / });
  await peerComposer.fill("Keep this unfinished draft");
  // Warm the dev route before measuring transport latency.
  await you.request.post(`${app}/api/messages/${id}/typing`, {
    headers: { origin: app },
    data: { active: false, clientId: randomUUID() },
  });
  await page.bringToFront();
  let since = Date.now();
  await composer.fill("Typing a private message");
  await peer
    .getByText("Zayd is typing…", { exact: true })
    .waitFor({ timeout: 3000 });
  timings.typing = Date.now() - since;
  await composer.fill("");
  await peer
    .getByText("Zayd is typing…", { exact: true })
    .waitFor({ state: "hidden", timeout: 3000 });

  const text = `Live delivery ${randomUUID().slice(0, 8)}`;
  since = Date.now();
  await composer.fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await peer
    .locator('[data-slot="bubble-content"]')
    .filter({ hasText: text })
    .waitFor({ timeout: 3000 });
  timings.message = Date.now() - since;
  assert.equal(await peerComposer.inputValue(), "Keep this unfinished draft");
  await peer.bringToFront();
  await page.getByText("Seen", { exact: true }).waitFor({ timeout: 3000 });
  const thread = await (
    await you.request.get(`${app}/api/messages/${id}`)
  ).json();
  const message = thread.messages.find(
    (row: { body: string }) => row.body === text,
  );
  assert.ok(message);
  since = Date.now();
  const reaction = await eddie.request.put(
    `${app}/api/messages/${id}/${message.id}`,
    { headers: { origin: app }, data: { emoji: "🔥" } },
  );
  assert.equal(reaction.status(), 200);
  await page
    .locator(`[data-message-id="${message.id}"]`)
    .getByRole("button", { name: "🔥 reaction, react", exact: true })
    .waitFor({ timeout: 3000 });
  timings.reaction = Date.now() - since;

  // There should be no healthy-path message polling, even past the old 10s interval.
  await page.waitForTimeout(2000);
  const reads: string[] = [];
  const track = (request: import("playwright").Request) => {
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname.startsWith("/api/messages")
    )
      reads.push(request.url());
  };
  page.on("request", track);
  peer.on("request", track);
  await page.waitForTimeout(11_000);
  page.off("request", track);
  peer.off("request", track);
  assert.deepEqual(reads, [], "An idle conversation should not poll for data.");

  // Network loss must preserve the draft and catch up through DB revisions.
  await eddie.setOffline(true);
  const missed = `While you were offline ${randomUUID().slice(0, 8)}`;
  const sent = await you.request.post(`${app}/api/messages/${id}`, {
    headers: { origin: app },
    data: { clientId: randomUUID(), body: missed },
  });
  assert.equal(sent.status(), 201);
  await eddie.setOffline(false);
  await peer
    .locator('[data-slot="bubble-content"]')
    .filter({ hasText: missed })
    .waitFor({ timeout: 8000 });
  assert.equal(await peerComposer.inputValue(), "Keep this unfinished draft");

  // Simulate losing the web process's Postgres listener, as can happen on a restart.
  await db.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'pickleballs-realtime' AND datname = current_database()",
  );
  for (const tab of [page, peer])
    await tab
      .locator('[data-realtime-status="live"]')
      .waitFor({ timeout: 10_000 });
  const resumed = `After reconnect ${randomUUID().slice(0, 8)}`;
  assert.equal(
    (
      await you.request.post(`${app}/api/messages/${id}`, {
        headers: { origin: app },
        data: { clientId: randomUUID(), body: resumed },
      })
    ).status(),
    201,
  );
  await peer
    .locator('[data-slot="bubble-content"]')
    .filter({ hasText: resumed })
    .waitFor({ timeout: 5000 });

  since = Date.now();
  assert.equal(
    (
      await you.request.delete(`${app}/api/messages/${id}/${message.id}`, {
        headers: { origin: app },
      })
    ).status(),
    200,
  );
  await peer
    .locator(`[data-message-id="${message.id}"]`)
    .getByText("Message deleted", { exact: true })
    .waitFor({ timeout: 3000 });
  timings.deletion = Date.now() - since;

  for (const width of [1440, 768, 390, 320]) {
    await peer.setViewportSize({ width, height: 960 });
    await peer.waitForTimeout(100);
    assert.equal(
      await peer.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      true,
      `Overflow at ${width}px`,
    );
    await peer.screenshot({ path: `/private/tmp/pb-realtime-${width}.png` });
  }

  // Feed delivery and worker-originated notifications use the same connection.
  await peer.setViewportSize({ width: 1440, height: 960 });
  await peer.goto(`${app}/feed`);
  await peer.getByRole("region", { name: "Circle timeline" }).waitFor();
  const note = `A live check-in ${randomUUID().slice(0, 8)}`;
  since = Date.now();
  const checkIn = await you.request.post(`${app}/api/check-in`, {
    headers: { origin: app },
    data: { signal: "NAY", blocker: note },
  });
  assert.equal(checkIn.status(), 200);
  await peer.getByText(note, { exact: true }).waitFor({ timeout: 5000 });
  timings.feed = Date.now() - since;
  const notification = `Live worker notification ${randomUUID().slice(0, 8)}`;
  await db.query(
    'INSERT INTO "Notification" (id,"recipientId","actorId","circleId",kind,title,body) VALUES ($1,$2,$3,$4,\'REPLY_POSTED\',$5,$6)',
    [
      randomUUID(),
      "demo-eddie",
      "demo-you",
      "demo-circle",
      notification,
      "Realtime fixture",
    ],
  );
  await peer.getByRole("button", { name: /\d+ unread notifications/ }).click();
  await peer
    .getByText(notification, { exact: true })
    .waitFor({ timeout: 5000 });
  assert.deepEqual(errors, []);
  console.log(
    `Realtime browser checks passed: typing/start/stop, delivery, receipts, reactions, zero idle polling, offline recovery, listener reconnect, deletion, draft preservation, 320/390/768/1440px, feed and worker notifications. Latency (ms): ${JSON.stringify(timings)}`,
  );
} finally {
  await db.end();
  await browser.close();
}
