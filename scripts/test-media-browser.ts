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
  const segments: string[] = [];
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
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith(".ts")) segments.push(path);
  });
  await page.goto("http://localhost:3318/login");
  await page.waitForFunction(
    () => !!document.querySelector("video")?.currentSrc,
  );
  const first = page.locator("video").first();
  if (!safari) {
    await page.waitForFunction(
      () => (document.querySelector("video")?.readyState ?? 0) >= 2,
    );
    const initial = await first.evaluate((video: HTMLVideoElement) => ({
      src: video.currentSrc,
      buffer: video.buffered.length ? video.buffered.end(0) : 0,
    }));
    assert(
      initial.src.startsWith("blob:"),
      "Chromium must use adaptive HLS, not silently fall back to MP4.",
    );
    assert(initial.buffer <= 8, "Only a small buffer should preload.");
    assert(
      segments.every((path) => path.includes("v0_")),
      "Initial loading must use the smallest rendition.",
    );
  } else {
    assert(
      (
        await first.evaluate((video: HTMLVideoElement) => video.currentSrc)
      ).includes("master.m3u8"),
      "WebKit should use native HLS.",
    );
  }
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
  const mediaId = await first.getAttribute("poster");
  assert(mediaId);
  const mediaPath = mediaId.split("?")[0];
  const anonymous = await browser.newContext();
  for (const path of [
    `${mediaPath}?playback=1`,
    `${mediaPath}/hls/master.m3u8`,
    `${mediaPath}/hls/v0.m3u8`,
  ]) {
    const response = await anonymous.request.get(
      `http://localhost:3317${path}`,
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
  const legacy = page.locator("video").nth(1);
  await legacy.evaluate((video: HTMLVideoElement) => video.play());
  await page.waitForFunction(
    () => document.querySelectorAll("video")[1]?.currentTime > 0.1,
  );
  await legacy.evaluate((video: HTMLVideoElement) => video.pause());
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Adaptive playback, seeking, private endpoints, full-screen viewer, and legacy MP4 passed.",
  );

  // Reject manifests to exercise ticket renewal and MP4 fallback without hiding
  // an actual decoder failure in the normal-playback assertions above.
  const broken = await context.newPage();
  await broken.bringToFront();
  if (safari) {
    // WebKit's native media stack bypasses Playwright's request interception.
    // Rewrite the JS ticket to a genuinely missing playlist instead.
    await broken.route(
      (url) => url.searchParams.get("playback") === "1",
      async (route) => {
        const response = await route.fetch();
        const ticket = await response.json();
        await route.fulfill({
          response,
          json: { ...ticket, hlsUrl: `${mediaPath}/hls/unavailable.m3u8` },
        });
      },
    );
  } else {
    await broken.route("**/hls/*.m3u8", (route) =>
      route.fulfill({ status: 403, body: "Expired" }),
    );
  }
  await broken.goto("http://localhost:3317/");
  await broken.waitForFunction(
    () => !!document.querySelector("video")?.getAttribute("src"),
  );
  await broken
    .locator("video")
    .first()
    .evaluate((video: HTMLVideoElement) => {
      void video.play().catch(() => {});
    });
  await broken.waitForFunction(
    () =>
      document.querySelector("video")?.currentSrc.includes("fixture-video-0"),
    {},
    { timeout: 45_000 },
  );
  await broken
    .locator("video")
    .first()
    .evaluate((video: HTMLVideoElement) => video.play());
  await broken.waitForFunction(
    () => (document.querySelector("video")?.currentTime ?? 0) > 0.1,
  );
  console.log("Rejected HLS authorization recovers through MP4 fallback.");
  await context.close();
} finally {
  await browser.close();
}
