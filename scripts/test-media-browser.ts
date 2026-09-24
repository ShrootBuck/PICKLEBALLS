import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";

// Start `bun scripts/test-social.ts --media-only --serve --video` first.
// Uses only the disposable fixture, never a real account or production URL.
const safari = process.argv.includes("--webkit");
const browser = await (safari ? webkit : chromium).launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    // Existing timestamp formatting differs between Node and WebKit Intl data.
    // Keep that unrelated diagnostic visible without masking media errors.
    if (
      safari &&
      ((error.message.includes("Hydration failed") &&
        error.message.includes("PostTimestamp")) ||
        error.message.includes("webpack.hot-update.json") ||
        error.message.includes(
          "Router action dispatched before initialization",
        ))
    ) {
      console.warn(
        "Known unrelated WebKit timestamp/development-overlay error.",
      );
    } else errors.push(error.message);
  });
  await page.goto("http://localhost:3318/login");
  await page.waitForFunction(
    () => !!document.querySelector("video")?.currentSrc,
  );
  const first = page.locator("video").first();
  const initial = await first.evaluate((video: HTMLVideoElement) => ({
    src: video.currentSrc,
    loop: video.loop,
  }));
  assert(
    initial.src.includes("fixture-video-0"),
    "The player must load the MP4.",
  );
  assert(initial.loop, "Videos must loop.");
  assert.equal(
    await page.locator("video").nth(1).getAttribute("src"),
    null,
    "Inactive slides must not load.",
  );
  const started = Date.now();
  await first.evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForFunction(
    () => (document.querySelector("video")?.currentTime ?? 0) > 0.1,
  );
  console.log(
    `${safari ? "WebKit" : "Chromium"} fixture startup: ${Date.now() - started} ms (local, preloaded).`,
  );
  await first.evaluate((video: HTMLVideoElement) => {
    video.currentTime = 8;
  });
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return (
      video && video.currentTime >= 8 && !video.seeking && video.readyState >= 2
    );
  });
  // The 12-second fixture must wrap back to the start instead of stopping.
  await first.evaluate((video: HTMLVideoElement) => {
    video.currentTime = video.duration - 0.5;
  });
  await page.waitForFunction(() => {
    const video = document.querySelector("video");
    return (
      video && !video.paused && video.currentTime > 0 && video.currentTime < 2
    );
  });
  const mediaId = await first.getAttribute("poster");
  assert(mediaId);
  const mediaPath = mediaId.split("?")[0];
  const anonymous = await browser.newContext();
  for (const path of [`${mediaPath}?playback=1`, mediaPath]) {
    const response = await anonymous.request.get(
      `http://localhost:3317${path}`,
      { maxRedirects: 0 },
    );
    assert(
      [401, 404].includes(response.status()),
      "Anonymous access must not reveal private media.",
    );
  }
  await anonymous.close();
  await page.getByRole("button", { name: "View full video 1 of 2" }).click();
  const full = page.getByLabel("Full video evidence", { exact: true });
  await page.waitForFunction(
    () =>
      !!document.querySelector<HTMLVideoElement>(
        'video[aria-label="Full video evidence"]',
      )?.currentSrc,
  );
  await full.evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(
      'video[aria-label="Full video evidence"]',
    );
    return video && video.currentTime > 0.1;
  });
  assert.equal(
    await page
      .locator("video")
      .evaluateAll(
        (videos: HTMLVideoElement[]) =>
          videos.filter((video: HTMLVideoElement) => !video.paused).length,
      ),
    1,
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Next attachment", exact: true })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelectorAll("video")[1]
      ?.currentSrc.includes("fixture-video-1"),
  );
  const second = page.locator("video").nth(1);
  await second.evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForFunction(
    () => document.querySelectorAll("video")[1]?.currentTime > 0.1,
  );
  await second.evaluate((video: HTMLVideoElement) => video.pause());
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "MP4 playback, looping, seeking, private endpoints, and full-screen viewer passed.",
  );

  // Hand out one ticket for a missing object, as if its signed URL had expired.
  // The player must renew the ticket once and play instead of showing Retry.
  const broken = await context.newPage();
  await broken.bringToFront();
  let rejected = false;
  await broken.route(
    (url) => url.searchParams.get("playback") === "1",
    async (route) => {
      const response = await route.fetch();
      const ticket = await response.json();
      if (rejected) return route.fulfill({ response, json: ticket });
      rejected = true;
      await route.fulfill({
        response,
        json: {
          ...ticket,
          url: new URL("/media/expired-fixture", ticket.url).toString(),
        },
      });
    },
  );
  await broken.goto("http://localhost:3317/");
  await broken.waitForFunction(
    () =>
      document.querySelector("video")?.currentSrc.includes("fixture-video-0"),
    {},
    { timeout: 45_000 },
  );
  assert(rejected, "The first ticket must have been rejected.");
  await broken
    .locator("video")
    .first()
    .evaluate((video: HTMLVideoElement) => video.play());
  await broken.waitForFunction(
    () => (document.querySelector("video")?.currentTime ?? 0) > 0.1,
  );
  console.log("A rejected video URL recovers by renewing the ticket.");
  await context.close();
} finally {
  await browser.close();
}
