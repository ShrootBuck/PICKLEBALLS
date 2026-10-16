// Run against bun run test:fixture. All deployment data below is simulated.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const build = (
  id: string,
  status: "queued" | "in_progress" | "finished" | "failed",
  age: number,
) => ({
  id,
  status,
  commit: createHash("sha1")
    .update(id.replace(/^(web|worker)-/, ""))
    .digest("hex"),
  commitMessage: id.endsWith("running")
    ? "Refine streak ember visuals with warm flame gradients"
    : `Update ${id.replace(/^(web|worker)-/, "")}`,
  createdAt: new Date(Date.now() - age).toISOString(),
});
let state: BuildTVResponse = {
  connection: "connected",
  snapshot: {
    updatedAt: new Date().toISOString(),
    queued: 3,
    running: 1,
    services: [
      {
        key: "web",
        queued: 1,
        running: 1,
        builds: [
          build("web-running", "in_progress", 120000),
          build("web-next", "queued", 30000),
          build("web-done", "finished", 300000),
          build("web-failed", "finished", 400000),
        ],
      },
      {
        key: "worker",
        queued: 2,
        running: 0,
        builds: [
          build("worker-running", "queued", 120000),
          build("worker-next", "queued", 30000),
          build("worker-done", "finished", 300000),
          build("worker-failed", "failed", 400000),
        ],
      },
    ],
  },
};
let fail = false;
let requests = 0;
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
  await page.getByRole("button", { name: "Open app tools" }).click();
  const trigger = page.getByRole("button", { name: /^Open Build TV/ });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Build TV" });
  await dialog.getByText("Fresh code on the way.").waitFor();
  assert.equal(await dialog.locator("[data-build-id]:visible").count(), 2);
  assert.deepEqual(
    await dialog
      .getByRole("region", { name: "Up next", exact: true })
      .locator("li")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-build-id")),
      ),
    [createHash("sha1").update("next").digest("hex")],
  );
  assert.deepEqual(await dialog.locator("dd").allTextContents(), ["1", "1"]);
  assert.equal(
    await dialog.getByText("Background worker", { exact: true }).count(),
    0,
  );
  assert.equal(await dialog.getByText("Website", { exact: true }).count(), 0);
  assert.equal(
    await dialog
      .getByText("Refine streak ember visuals with warm flame gradients")
      .count(),
    1,
  );
  assert.equal(
    await dialog
      .locator(".build-tv-parcels")
      .evaluate((n) => getComputedStyle(n).animationName),
    "none",
  );
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 740 });
    await page.waitForFunction(() => {
      const node = document.querySelector("[data-build-tv]");
      if (!node) return false;
      const r = node.getBoundingClientRect();
      return (
        r.left >= 0 &&
        r.right <= innerWidth &&
        r.top >= 0 &&
        r.bottom <= innerHeight + 1
      );
    });
    assert(
      await dialog.evaluate((node) => {
        const r = node.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          r.bottom <= innerHeight + 1 &&
          node.scrollWidth <= node.clientWidth + 1
        );
      }),
      `Dialog overflows at ${width}`,
    );
    await page.screenshot({ path: `${output}/queue-${width}.png` });
  }
  await dialog.getByRole("button", { name: /Recent updates/ }).click();
  await dialog.getByText("Finished", { exact: true }).waitFor();
  await dialog.getByText("Failed", { exact: true }).waitFor();
  assert.equal(await dialog.locator("[data-build-id]:visible").count(), 4);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert(await trigger.evaluate((n) => n === document.activeElement));
  await trigger.click();
  fail = true;
  await dialog.getByText("Lost the signal.").waitFor();
  assert.equal(await dialog.locator("dd").nth(1).innerText(), "1");
  await dialog.getByText(/Counts may have changed/).waitFor();
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
          builds: [build("done", "finished", 1000)],
        },
      ],
    },
  };
  await dialog.getByText("Nothing cooking.").waitFor();
  assert.equal(
    await dialog.getByRole("region", { name: "Up next", exact: true }).count(),
    0,
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = requests;
  await new Promise((resolve) => setTimeout(resolve, 5500));
  assert.equal(requests, before);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForResponse("**/api/build-tv");
  state = { connection: "unconfigured", snapshot: null };
  await dialog.getByText("Off air.").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `Build TV passed: grouped updates and counts, queue order, collapsed history, responsive layout, focus, stale/offline recovery, hidden-tab polling. Screenshots: ${output}`,
  );
} catch (error) {
  console.error("Build TV failure", { requests, errors, url: page.url() });
  console.error(await page.locator("body").innerText());
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
