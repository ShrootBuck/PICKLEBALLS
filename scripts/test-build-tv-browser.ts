// Run against bun run test:fixture. All deployment data below is simulated.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import type { BuildTVResponse } from "../lib/build-tv";
import { launchFixtureBrowser } from "./browser-fixture";

const output = "/private/tmp/pb-build-tv";
await mkdir(output, { recursive: true });
const browser = await launchFixtureBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));

let state: BuildTVResponse = {
  connection: "connected",
  snapshot: {
    updatedAt: new Date().toISOString(),
    queued: 20_000,
    running: 1,
    services: [
      {
        key: "web",
        queued: 12_000,
        running: 1,
        latest: {
          id: "web-1",
          status: "in_progress",
          commit: "a1b2c3d",
          createdAt: new Date(Date.now() - 90_000).toISOString(),
        },
      },
      {
        key: "worker",
        queued: 8_000,
        running: 0,
        latest: {
          id: "worker-1",
          status: "queued",
          commit: "a1b2c3d",
          createdAt: new Date(Date.now() - 60_000).toISOString(),
        },
      },
    ],
  },
};
let requests = 0;
let fail = false;
try {
  await page.goto("http://localhost:3318/login");
  await page.locator("#main h1").waitFor();
  const real = await context.request.get("http://localhost:3317/api/build-tv", {
    headers: { origin: "http://localhost:3317" },
  });
  assert.equal(real.status(), 200);
  assert.equal((await real.json()).connection, "unconfigured");
  const anonymous = await browser.newContext();
  assert.equal(
    (
      await anonymous.request.get("http://localhost:3317/api/build-tv", {
        headers: { origin: "http://localhost:3317" },
      })
    ).status(),
    401,
  );
  await anonymous.close();
  await page.route("**/api/build-tv", (route) => {
    requests++;
    return route.fulfill({
      status: fail ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(fail ? {} : state),
    });
  });
  await page.reload();
  const trigger = page.getByRole("button", { name: /^Open Build TV/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Build TV" });
  await dialog.getByText("We may be here a while.").waitFor();
  assert.equal(await dialog.locator("dd").nth(1).innerText(), "20,000");
  assert.equal(
    await dialog
      .locator(".build-tv-parcels")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
  );
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 740 });
    const fits = await dialog.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const header = document.querySelector(".app-header");
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        node.scrollWidth <= node.clientWidth + 1 &&
        document.documentElement.scrollWidth <= innerWidth &&
        (!header || header.scrollWidth <= header.clientWidth + 1)
      );
    });
    assert(fits, `Build TV or the header overflows at ${width}px`);
    if ([1440, 390, 320].includes(width))
      await page.screenshot({ path: `${output}/queue-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert.equal(
    await dialog
      .locator(".build-tv-parcels")
      .evaluate((node) => getComputedStyle(node).animationName),
    "build-tv-conveyor",
  );
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert(
    await trigger.evaluate((node) => node === document.activeElement),
    "Escape returns focus to the TV button",
  );
  await trigger.click();
  await dialog.waitFor();
  fail = true;
  await dialog.getByText("Lost the signal.").waitFor();
  assert.equal(
    await dialog.locator("dd").nth(1).innerText(),
    "20,000",
    "A brief outage retains the last known counts",
  );
  assert.equal(
    await dialog
      .locator(".build-tv-parcels")
      .evaluate((node) => getComputedStyle(node).animationName),
    "none",
    "Stale builds stop animating",
  );
  await dialog.getByText(/Counts may have changed/).waitFor();
  await page.screenshot({ path: `${output}/reconnecting.png` });
  fail = false;
  state = { connection: "offline", snapshot: null };
  await page.waitForFunction(
    () =>
      document.querySelectorAll("[data-build-tv] dd")[1]?.textContent === "?",
  );
  state = {
    connection: "connected",
    snapshot: {
      updatedAt: new Date().toISOString(),
      queued: 0,
      running: 0,
      services: [
        {
          key: "web",
          queued: 0,
          running: 0,
          latest: {
            id: "failed",
            status: "failed",
            commit: "aaaaaaa",
            createdAt: new Date().toISOString(),
          },
        },
        {
          key: "worker",
          queued: 0,
          running: 0,
          latest: {
            id: "cancelled",
            status: "cancelled-by-user",
            commit: "aaaaaaa",
            createdAt: new Date().toISOString(),
          },
        },
      ],
    },
  };
  await dialog.getByText("Nothing cooking.").waitFor();
  await dialog.getByText("Failed", { exact: true }).waitFor();
  await dialog.getByText("Cancelled", { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/idle.png` });
  const latestWeb = state.snapshot?.services[0].latest;
  assert(latestWeb);
  latestWeb.status = "finished";
  await dialog.getByText("Finished", { exact: true }).waitFor();
  // Hide the tab before the next poll; no upstream requests should be scheduled.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = requests;
  await new Promise((resolve) => setTimeout(resolve, 5_500));
  assert.equal(requests, before, "Hidden tabs stop polling");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForResponse("**/api/build-tv");
  assert(requests > before, "Visible tabs reconnect");
  state = { connection: "unconfigured", snapshot: null };
  await dialog.getByText("Off air.").waitFor();
  assert.equal(await dialog.locator("dd").first().innerText(), "?");
  assert.deepEqual(errors, []);
  console.log(
    "Build TV passed: authenticated API, 20,000 builds, desktop/tablet/phone layout, reduced motion, focus, stale/offline/recovery, results, and hidden-tab polling.",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
