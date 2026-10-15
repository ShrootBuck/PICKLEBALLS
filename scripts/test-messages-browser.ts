// Run against disposable accounts: bun run test:fixture --video.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import sharp from "sharp";
import { fixtureEnvironment, launchFixtureBrowser } from "./browser-fixture";

const browser = await launchFixtureBrowser();
const app = "http://localhost:3317";
try {
  const you = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  const eddie = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  const sam = await browser.newContext();
  const page = await you.newPage();
  const peer = await eddie.newPage();
  const outsider = await sam.newPage();
  const errors: string[] = [];
  for (const tab of [page, peer, outsider])
    tab.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3318/login");
  await peer.goto("http://localhost:3318/login?user=eddie");
  await outsider.goto("http://localhost:3318/login?user=sam");
  await page.goto(`${app}/members/demo-eddie`);
  await page.getByRole("link", { name: "Message", exact: true }).click();
  await page.waitForURL(/messages\?chat=/);
  const id = new URL(page.url()).searchParams.get("chat");
  assert.ok(id);
  const guest = await browser.newContext();
  assert.equal((await guest.request.get(`${app}/api/messages`)).status(), 401);
  assert.equal(
    (await guest.request.get(`${app}/api/messages/${id}`)).status(),
    401,
  );
  await guest.close();
  const conversation = page.getByRole("region", {
    name: "Conversation with Eddie",
  });
  await conversation.waitFor();
  const composer = page.getByRole("textbox", { name: "Message Eddie" });
  const body = `Hey Eddie, private chat check ${randomUUID().slice(0, 8)}`;
  await composer.fill(body);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await conversation
    .locator('[data-slot="bubble-content"]')
    .filter({ hasText: body })
    .waitFor();
  let thread = await (
    await you.request.get(`${app}/api/messages/${id}`)
  ).json();
  const message = thread.messages.find(
    (item: { body: string }) => item.body === body,
  );
  assert.ok(message);
  assert.equal(
    (await sam.request.get(`${app}/api/messages/${id}`)).status(),
    404,
  );
  assert.equal(
    (
      await sam.request.post(`${app}/api/messages/${id}`, {
        headers: { origin: app },
        data: { clientId: randomUUID(), body: "intrusion" },
      })
    ).status(),
    404,
  );
  assert.equal(
    (
      await sam.request.put(`${app}/api/messages/${id}/${message.id}`, {
        headers: { origin: app },
        data: { emoji: "🔥" },
      })
    ).status(),
    404,
  );
  assert.equal(
    (
      await you.request.post(`${app}/api/messages/${id}`, {
        headers: { origin: "https://elsewhere.invalid" },
        data: { clientId: randomUUID(), body: "bad origin" },
      })
    ).status(),
    403,
  );
  await peer
    .getByRole("link", { name: /Messages, \d+ unread/ })
    .waitFor({ timeout: 20_000 });
  await peer.goto(`${app}/messages?chat=${id}`);
  await peer.bringToFront();
  const peerMessage = peer.locator(`[data-message-id="${message.id}"]`);
  await peerMessage.waitFor();
  await peer.waitForFunction(async () => {
    const response = await fetch("/api/messages?unread=1");
    return (await response.json()).unread === 0;
  });
  await peerMessage.getByRole("button", { name: "React to message" }).click();
  await peer.getByRole("button", { name: "React 🔥", exact: true }).click();
  await page
    .locator(`[data-message-id="${message.id}"]`)
    .getByRole("button", { name: "🔥 reaction, react", exact: true })
    .waitFor({ timeout: 15_000 });
  await peer.reload();
  await peer
    .locator(`[data-message-id="${message.id}"]`)
    .getByRole("button", { name: "🔥 reaction, remove yours", exact: true })
    .waitFor();
  const replyBody = `Finally. A place for the important nonsense. ${randomUUID().slice(0, 8)}`;
  await peer.getByRole("textbox", { name: /Message / }).fill(replyBody);
  await peer.getByRole("button", { name: "Send message", exact: true }).click();
  await conversation
    .locator('[data-slot="bubble-content"]')
    .filter({ hasText: replyBody })
    .waitFor({ timeout: 15_000 });

  // A server success with a lost response must not duplicate the message on retry.
  await page.bringToFront();
  let loseResponse = true;
  await page.route(`**/api/messages/${id}`, async (route) => {
    if (route.request().method() === "POST" && loseResponse) {
      loseResponse = false;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort("failed");
    } else await route.continue();
  });
  const retryBody = `Retry without a double send ${randomUUID().slice(0, 8)}`;
  await composer.fill(retryBody);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.locator(".dm-composer [role=alert]").waitFor();
  assert.equal(await composer.inputValue(), retryBody);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.waitForFunction(
    () =>
      (document.querySelector(".dm-textarea") as HTMLTextAreaElement)?.value ===
      "",
  );
  await page.unroute(`**/api/messages/${id}`);
  thread = await (await you.request.get(`${app}/api/messages/${id}`)).json();
  assert.equal(
    thread.messages.filter((item: { body: string }) => item.body === retryBody)
      .length,
    1,
  );

  // Real image upload and recipient rendering, including private image/poster/playback gates.
  const photo = await sharp({
    create: { width: 720, height: 480, channels: 3, background: "#c4dbb8" },
  })
    .png()
    .toBuffer();
  await page.locator('input[type="file"]').setInputFiles({
    name: "a-very-important-photo.png",
    mimeType: "image/png",
    buffer: photo,
  });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.dm-composer [data-slot="attachment"]')
        .length === 0,
  );
  thread = await (await you.request.get(`${app}/api/messages/${id}`)).json();
  const imageMessage = thread.messages.findLast(
    (item: { mediaIds: string[] }) => item.mediaIds.length > 0,
  );
  assert.ok(imageMessage);
  const mediaId = imageMessage.mediaIds[0];
  const imageResponse = await eddie.request.get(`${app}/api/media/${mediaId}`);
  assert.equal(imageResponse.status(), 200);
  assert.match(imageResponse.headers()["cache-control"], /no-store/);
  for (const suffix of ["", "?poster=1", "?playback=1"])
    assert.equal(
      (await sam.request.get(`${app}/api/media/${mediaId}${suffix}`)).status(),
      404,
    );
  await peer
    .locator(`[data-message-id="${imageMessage.id}"] img`)
    .first()
    .waitFor({ timeout: 15_000 });

  // Reuse the fixture's encoded video to exercise DM playback, posters and ranges.
  const videoFile = Bun.file("/private/tmp/pb-video-fixture.mp4");
  assert.ok(await videoFile.exists(), "Start the fixture with --video.");
  const videoId = `v_${randomUUID()}`;
  const videoKey = `fixture-video-dm-${randomUUID()}`;
  const db = new Client({ connectionString: fixtureEnvironment.DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      `INSERT INTO "MediaUpload" (id,"ownerId","directConversationId","mimeType","sizeBytes","objectKey",ready,"posterKey",duration)
      VALUES ($1,'demo-you',$2,'video/mp4',$3,$4,true,$5,2)`,
      [videoId, id, videoFile.size, videoKey, `${videoKey}/poster`],
    );
  } finally {
    await db.end();
  }
  const videoMessageResponse = await you.request.post(
    `${app}/api/messages/${id}`,
    {
      headers: { origin: app },
      data: {
        clientId: randomUUID(),
        body: "An important video, too.",
        mediaIds: [videoId],
      },
    },
  );
  assert.equal(videoMessageResponse.status(), 201);
  const { message: videoMessage } = await videoMessageResponse.json();
  const ticketResponse = await eddie.request.get(
    `${app}/api/media/${videoId}?playback=1`,
  );
  assert.equal(ticketResponse.status(), 200);
  const ticket = await ticketResponse.json();
  const range = await eddie.request.get(`${app}${ticket.url}`, {
    headers: { range: "bytes=0-31" },
  });
  assert.equal(range.status(), 206);
  assert.equal((await range.body()).length, 32);
  assert.match(range.headers()["cache-control"], /no-store/);
  assert.equal(
    (await eddie.request.get(`${app}/api/media/${videoId}?poster=1`)).status(),
    200,
  );
  for (const suffix of ["", "?poster=1", "?playback=1"])
    assert.equal(
      (await sam.request.get(`${app}/api/media/${videoId}${suffix}`)).status(),
      404,
    );
  const video = peer
    .locator(`[data-message-id="${videoMessage.id}"] video`)
    .first();
  await video.waitFor({ timeout: 15_000 });
  await video.scrollIntoViewIfNeeded();
  // Realtime can mount the video before its private playback ticket finishes.
  // Wait for usable media, then assert playback survives a live reaction.
  await peer.waitForFunction((messageId) => {
    const element = document.querySelector(
      `[data-message-id="${messageId}"] video`,
    ) as HTMLVideoElement | null;
    return !!element && element.readyState >= 1;
  }, videoMessage.id);
  await video.evaluate(async (element) => {
    await (element as HTMLVideoElement).play();
  });
  await peer.waitForFunction((messageId) => {
    const element = document.querySelector(
      `[data-message-id="${messageId}"] video`,
    ) as HTMLVideoElement | null;
    return !!element && element.currentTime > 0;
  }, videoMessage.id);
  await video.evaluate((element) => {
    element.setAttribute("data-realtime-loads", "0");
    element.addEventListener("loadstart", () => {
      element.setAttribute(
        "data-realtime-loads",
        String(Number(element.getAttribute("data-realtime-loads")) + 1),
      );
    });
  });
  assert.equal(
    (
      await you.request.put(`${app}/api/messages/${id}/${videoMessage.id}`, {
        headers: { origin: app },
        data: { emoji: "👍" },
      })
    ).status(),
    200,
  );
  await peer
    .locator(`[data-message-id="${videoMessage.id}"]`)
    .getByRole("button", { name: "👍 reaction, react", exact: true })
    .waitFor();
  assert.equal(
    await video.getAttribute("data-realtime-loads"),
    "0",
    "A live reaction must not reload a playing video.",
  );

  // Drafts survive switching chats; mobile opens one conversation at a time.
  await composer.fill("Don't lose this draft");
  await page.getByRole("button", { name: "New message", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Sam" }).click();
  await page.getByRole("textbox", { name: "Message Sam" }).waitFor();
  await page
    .getByRole("navigation", { name: "Direct messages", exact: true })
    .getByRole("link")
    .filter({ hasText: "Eddie" })
    .click();
  assert.equal(await composer.inputValue(), "Don't lose this draft");
  await composer.fill("");
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await composer.waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const box = await composer.boundingBox();
    assert.ok(
      box && box.y >= 0 && box.y + box.height <= viewport.height,
      `Composer must stay visible at ${viewport.width}px`,
    );
    await page.screenshot({ path: `/private/tmp/pb-dm-${viewport.width}.png` });
  }
  await page.getByRole("link", { name: "Back to messages" }).click();
  await page.getByRole("heading", { name: "Messages." }).waitFor();
  await page
    .getByRole("navigation", { name: "Direct messages", exact: true })
    .getByRole("link")
    .filter({ hasText: "Eddie" })
    .click();
  await composer.waitFor();
  // Mobile keyboards shrink visualViewport without necessarily changing dvh.
  await page.evaluate(() => {
    document.documentElement.style.setProperty(
      "--visual-viewport-height",
      "360px",
    );
    document.documentElement.style.setProperty("--visual-viewport-top", "0px");
  });
  const keyboardBox = await composer.boundingBox();
  assert.ok(
    keyboardBox && keyboardBox.y + keyboardBox.height <= 360,
    "Composer must stay above the keyboard",
  );
  await page.evaluate(() =>
    document.documentElement.style.removeProperty("--visual-viewport-height"),
  );

  // Delete one's own message; the recipient sees the tombstone and loses media access.
  await page.setViewportSize({ width: 1440, height: 960 });
  const imageBubble = page.locator(`[data-message-id="${imageMessage.id}"]`);
  await imageBubble.getByRole("button", { name: "React to message" }).click();
  await page
    .getByRole("button", { name: "Delete message", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete message", exact: true })
    .click();
  await peer
    .locator(`[data-message-id="${imageMessage.id}"]`)
    .getByText("Message deleted", { exact: true })
    .waitFor({ timeout: 15_000 });
  assert.equal(
    (await eddie.request.get(`${app}/api/media/${mediaId}`)).status(),
    404,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: profile DM entry, two-user send/reply, unread indicator and acknowledgement, reaction persistence, retry idempotency, private photo upload, video playback/posters/ranges, unauthorized read/send/react/media rejection, draft switching, 1440/768/390/320px layout, and message deletion.",
  );
} finally {
  await browser.close();
}
