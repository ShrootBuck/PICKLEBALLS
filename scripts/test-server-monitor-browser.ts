// Browser visuals use simulated readings. The API/auth and collector have separate checks.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import type { MonitorResponse } from "../lib/server-monitor";
import { launchFixtureBrowser } from "./browser-fixture";

const browser = await launchFixtureBrowser();
const engine = process.argv.includes("--webkit") ? "webkit" : "chromium";
const output = `/private/tmp/pb-server-monitor/${engine}`;
await mkdir(output, { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
let requests = 0;
let status = 200;
let configured = true;
let firstSample = false;
let sensors = true;
let phase = "initial";
function snapshot(at: number): MonitorResponse {
  return {
    connection: "connected",
    snapshot: {
      sample: {
        at,
        uptime: 7 * 86400 + 22 * 3600,
        cpu: {
          model: "Intel Core i7-5600U @ 2.60GHz",
          percent: firstSample ? null : 33,
          cores: [23, 28, 40, 41].map((percent, index) => ({
            id: `cpu${index}`,
            percent: firstSample ? null : percent,
          })),
          load: [3.21, 3.62, 3.25],
          temperature: sensors ? 72 : null,
          frequency: sensors ? 3100 : null,
        },
        memory: { used: 3.04 * 1024 ** 3, total: 7.12 * 1024 ** 3 },
        swap: { used: 1024 ** 3, total: 3.99 * 1024 ** 3 },
        disk: { used: 126 * 1024 ** 3, total: 232 * 1024 ** 3 },
        io:
          firstSample || !sensors
            ? null
            : { read: 716 * 1024, write: 112 * 1024 },
        network:
          firstSample || !sensors
            ? null
            : { received: 230 * 1024, sent: 38.3 * 1024 },
      },
      history: firstSample
        ? []
        : Array.from({ length: 61 }, (_, i) => ({
            at: at - (60 - i) * 5000,
            cpu: Math.min(
              95,
              24 + 13 * Math.sin(i * 0.4) + (i > 20 && i < 32 ? 42 : 0),
            ),
            memory: 40 + i / 20 + Math.sin(i * 0.5),
            disk: 54,
            read: sensors
              ? (300 + 180 * Math.sin(i * 0.7) + (i > 35 && i < 41 ? 500 : 0)) *
                1024
              : null,
            write: sensors ? (65 + 50 * Math.sin(i * 0.45)) * 1024 : null,
            received: sensors
              ? (160 + 90 * Math.sin(i * 0.45) + (i > 10 && i < 18 ? 200 : 0)) *
                1024
              : null,
            sent: sensors ? (40 + 30 * Math.sin(i * 0.6)) * 1024 : null,
          })),
    },
  };
}
try {
  await page.clock.install();
  await page.goto("http://localhost:3318/login");
  await page.locator("#main h1").waitFor();
  const real = await context.request.get(
    "http://localhost:3317/api/server-monitor",
    { headers: { origin: "http://localhost:3317" } },
  );
  assert.equal(real.status(), 200);
  assert.equal(real.headers()["cache-control"], "private, no-store");
  assert.equal((await real.json()).connection, "unconfigured");
  const anonymous = await browser.newContext();
  assert.equal(
    (
      await anonymous.request.get("http://localhost:3317/api/server-monitor", {
        headers: { origin: "http://localhost:3317" },
      })
    ).status(),
    401,
  );
  assert.equal(
    (
      await context.request.get("http://localhost:3317/api/server-monitor", {
        headers: { origin: "https://other.example" },
      })
    ).status(),
    403,
  );
  await anonymous.close();
  await page.route("**/api/server-monitor", async (route) => {
    requests++;
    const at = await page.evaluate(() => Date.now());
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(
        status !== 200
          ? {}
          : configured
            ? snapshot(at)
            : { connection: "unconfigured", snapshot: null },
      ),
    });
  });
  assert.equal(requests, 0);
  await Promise.all([
    page.waitForResponse("**/api/build-tv"),
    page.getByRole("button", { name: "Open app tools" }).click(),
  ]);
  const trigger = page.getByRole("button", { name: "Open Server Monitor" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Server Monitor" });
  await dialog.getByText("Live", { exact: true }).waitFor();
  async function expectFullHistory() {
    const charts = dialog.locator("svg[role=img]");
    assert.equal(await charts.count(), 4);
    for (const chart of await charts.all()) {
      const paths = await chart
        .locator('path[fill="none"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("d") ?? ""),
        );
      assert(paths.length > 0);
      assert(
        paths.every(
          (path) => path.startsWith("M0.00,") && path.includes("L600.00,"),
        ),
        "Initial server history should span the full five-minute chart",
      );
    }
  }
  assert.equal(requests, 1, "History should render from the first response");
  await expectFullHistory();
  assert.equal(await dialog.locator("[data-metric]").count(), 4);
  assert.equal(await dialog.locator("svg[role=img]").count(), 4);
  assert.equal(await dialog.getByRole("meter").count(), 7);
  await dialog.getByText("72°C").waitFor();
  for (const [width, height] of [
    [1920, 1080],
    [1512, 874],
    [1440, 780],
    [1366, 680],
    [1280, 720],
    [1024, 768],
    [768, 1024],
    [390, 740],
    [320, 740],
  ]) {
    phase = `layout ${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => {
      const node = document.querySelector("[data-server-monitor]");
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight + 1 &&
        node.scrollWidth <= node.clientWidth + 1
      );
    });
    assert(
      await dialog.evaluate((node) =>
        [...node.querySelectorAll("[data-metric]")].every(
          (card) => card.scrollWidth <= card.clientWidth + 1,
        ),
      ),
      `Panel overflow at ${width}px`,
    );
    if (width >= 1024) {
      assert(
        await dialog.evaluate(
          (node) => node.scrollHeight <= node.clientHeight + 1,
        ),
        `Laptop monitor requires scrolling at ${width}x${height}`,
      );
    }
    await page.screenshot({ path: `${output}/${width}x${height}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.keyboard.press("Escape");
  phase = "closed polling";
  await dialog.waitFor({ state: "hidden" });
  assert(await trigger.evaluate((node) => node === document.activeElement));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      await page.locator(".app-header").evaluate((node) => {
        const buttons = [...node.querySelectorAll("button")].filter(
          (button) => button.getBoundingClientRect().width > 0,
        );
        return (
          node.scrollWidth <= node.clientWidth + 1 &&
          buttons.every((button) => {
            const rect = button.getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth;
          })
        );
      }),
      `Header controls overflow at ${width}px`,
    );
  }
  const closedRequests = requests;
  await page.clock.fastForward(5 * 60_000);
  assert.equal(requests, closedRequests, "Closed monitor must not poll");
  await trigger.click();
  phase = "reopening";
  await dialog.getByText("Live", { exact: true }).waitFor();
  await expectFullHistory();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenRequests = requests;
  await page.clock.fastForward(10000);
  assert.equal(requests, hiddenRequests, "Hidden monitor must not poll");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForResponse("**/api/server-monitor");
  status = 503;
  phase = "connection failure";
  await page.clock.fastForward(5000);
  await dialog.getByText("Reconnecting", { exact: true }).waitFor();
  await dialog.getByText("Showing last known readings").waitFor();
  await page.clock.fastForward(25000);
  await dialog.getByText("Waiting for the server.").waitFor();
  assert.equal(await dialog.locator("[data-metric]").count(), 0);
  status = 200;
  phase = "connection recovery";
  await page.clock.fastForward(5000);
  await dialog.getByText("Live", { exact: true }).waitFor();
  firstSample = true;
  phase = "first sample";
  await page.clock.fastForward(5000);
  await dialog.getByText("Measuring", { exact: true }).waitFor();
  assert.equal(
    await dialog.getByRole("meter").count(),
    3,
    "No made-up zero per-core values",
  );
  firstSample = false;
  sensors = false;
  phase = "missing sensors";
  await page.clock.fastForward(5000);
  await dialog.getByText("Temperature unavailable").waitFor();
  configured = false;
  phase = "unconfigured";
  await page.clock.fastForward(5000);
  await dialog.getByText("The monitor isn't connected yet.").waitFor();
  configured = true;
  status = 401;
  phase = "signed out";
  await page.clock.fastForward(5000);
  await dialog.getByText("Offline", { exact: true }).waitFor();
  await dialog.getByText("Sign in to view the server.").waitFor();
  const unauthorizedRequests = requests;
  await page.clock.fastForward(20000);
  assert.equal(requests, unauthorizedRequests, "Stop polling after sign-out");
  status = 200;
  phase = "signed in again";
  sensors = true;
  await page.keyboard.press("Escape");
  await trigger.click();
  await dialog.getByText("Live", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `Server Monitor ${engine} passed: membership/origin, responsive charts, focus, stale/offline/recovery, missing sensors, polling lifecycle. Screenshots: ${output}`,
  );
} catch (error) {
  console.error({
    phase,
    requests,
    errors,
    url: page.url(),
    dialog: await page
      .locator("[data-server-monitor]")
      .textContent()
      .catch(() => null),
  });
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
