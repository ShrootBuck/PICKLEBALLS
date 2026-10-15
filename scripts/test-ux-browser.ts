// Run against bun run test:fixture. All writes use disposable accounts.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchFixtureBrowser } from "./browser-fixture";

const origin = "http://localhost:3317";
const output = "/private/tmp/pb-ux-verified";
await mkdir(output, { recursive: true });
const browser = await launchFixtureBrowser();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const errors: string[] = [];
const failures: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
let streakId: string | undefined;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : error}`);
    console.error(`FAIL: ${failures.at(-1)}`);
    console.error(
      "At",
      page.url(),
      await page
        .locator('[data-slot="app-scroll"]')
        .evaluate((node) => ({
          top: node.scrollTop,
          height: node.clientHeight,
          content: node.scrollHeight,
        }))
        .catch(() => null),
    );
  }
}

try {
  await context.request.get("http://localhost:3318/login");
  await page.goto(origin);
  await page.locator("#main h1").waitFor();
  await check("Quick-create opens a streak from the Streaks page", async () => {
    assert((await context.request.get(`${origin}/streaks`)).ok());
    await page
      .getByRole("navigation", { name: "Section pages" })
      .getByRole("link", { name: "Streaks", exact: true })
      .click();
    await page.waitForURL(`${origin}/streaks`);
    await page.getByRole("heading", { name: "Streaks", exact: true }).waitFor();
    const historyLength = await page.evaluate(() => history.length);
    for (let attempt = 0; attempt < 2; attempt++) {
      await page
        .getByRole("button", {
          name: "Create a task, proof, check-in, or streak",
        })
        .click();
      await page.getByRole("button", { name: /^Start a streak/ }).click();
      const dialog = page.getByRole("dialog", { name: "Start a streak" });
      await dialog.waitFor({ timeout: 5_000 });
      assert.equal(new URL(page.url()).hash, "");
      assert.equal(await page.evaluate(() => history.length), historyLength);
      if (attempt === 0) {
        await dialog
          .getByLabel("Name", { exact: true })
          .fill("Discarded draft");
        await page.screenshot({ path: `${output}/quick-create-mobile.png` });
      } else {
        assert.equal(
          await dialog.getByLabel("Name", { exact: true }).inputValue(),
          "",
        );
      }
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
    }
    console.log(
      "Repeated quick-create opens, resets the draft, and preserves history.",
    );
    await page.locator('[data-slot="app-scroll"]').evaluate(
      (node) =>
        new Promise<void>((resolve) => {
          node.addEventListener(
            "scroll",
            () => requestAnimationFrame(() => resolve()),
            { once: true },
          );
          node.scrollTop = 300;
        }),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('[data-slot="app-scroll"]')?.scrollTop === 300,
    );
    console.log("Streak board scrolled to 300 before Back.");
    await page.goBack();
    await page.waitForURL(`${origin}/`);
    await page.locator("#main h1").waitFor();
    await page.goForward();
    await page.waitForURL(`${origin}/streaks`);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-slot="app-scroll"]')?.scrollTop === 300,
    );
    assert.equal(await page.getByRole("dialog").count(), 0);
  });
  await check(
    "Quick-create still opens a streak from another page",
    async () => {
      await page
        .getByRole("navigation", { name: "Mobile navigation" })
        .locator('a[href="/"]')
        .click();
      await page.waitForURL(`${origin}/`);
      await page
        .getByRole("button", {
          name: "Create a task, proof, check-in, or streak",
        })
        .click();
      await page.getByRole("button", { name: /^Start a streak/ }).click();
      const dialog = page.getByRole("dialog", { name: "Start a streak" });
      await dialog.waitFor();
      assert.equal(new URL(page.url()).pathname, "/streaks");
      assert.equal(new URL(page.url()).hash, "");
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("dialog").count(), 0);
    },
  );

  const streak = await context.request.post(`${origin}/api/streaks`, {
    headers: { Origin: origin },
    data: {
      circleId: "demo-circle",
      title: `Hold cancellation ${Date.now()}`,
      kind: "BUILD",
      visibility: "PRIVATE",
    },
  });
  assert.equal(streak.status(), 201, await streak.text());
  streakId = (await streak.json()).streak.id;
  // Compile new route modules before navigating: dev compilation can reload
  // the current page and interrupt an otherwise valid browser transition.
  assert((await context.request.get(`${origin}/streaks/${streakId}`)).ok());
  await page.locator(`a[href*="/streaks/${streakId}"]`).first().click();
  await page.waitForURL(new RegExp(`/streaks/${streakId}`));
  let submissions = 0;
  await page.route(`**/api/streaks/${streakId}/entries`, async (route) => {
    submissions++;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test save failed. Try again." }),
    });
  });
  async function openLog() {
    const sheet = page.locator('[data-slot="sheet-content"]');
    if (await sheet.count()) {
      await sheet.getByRole("button", { name: "Close", exact: true }).click();
      await sheet.waitFor({ state: "hidden" });
    }
    await page.getByRole("button", { name: "Log today", exact: true }).click();
    const hold = page.getByRole("button", {
      name: "Hold: did it",
      exact: true,
    });
    await hold.waitFor();
    return hold;
  }
  await check("Tabbing away cancels a held streak confirmation", async () => {
    const hold = await openLog();
    const before = submissions;
    await hold.focus();
    await page.keyboard.down("Space");
    assert.equal(await hold.getAttribute("data-holding"), "true");
    await page.keyboard.press("Tab");
    // Wait past the deliberate 650ms hold threshold.
    await page.waitForTimeout(900);
    await page.keyboard.up("Space");
    assert.equal(submissions, before, "Moving focus must not log a streak");
  });
  await check("Dragging off cancels a held streak confirmation", async () => {
    const hold = await openLog();
    const before = submissions;
    // Hover waits for the sheet's opening transition to settle before pressing.
    await hold.hover();
    const box = await hold.boundingBox();
    assert(box);
    await page.mouse.down();
    await page.waitForFunction(
      () => document.querySelector('.hold-button[data-holding="true"]'),
      undefined,
      { timeout: 500 },
    );
    await page.mouse.move(box.x + box.width / 2, box.y - 15);
    await page.waitForTimeout(900);
    await page.mouse.up();
    assert.equal(submissions, before, "Dragging off must not log a streak");
  });
  await check(
    "A deliberate hold submits once and can retry after failure",
    async () => {
      const hold = await openLog();
      for (let attempt = 0; attempt < 2; attempt++) {
        const before = submissions;
        await hold.focus();
        await page.keyboard.down("Space");
        await page.waitForTimeout(900);
        await page.keyboard.up("Space");
        await page
          .getByText("Test save failed. Try again.", { exact: true })
          .waitFor();
        assert.equal(submissions, before + 1);
      }
    },
  );

  assert.deepEqual(errors, [], "Unexpected browser errors");
  assert.deepEqual(failures, [], "UX regressions");
  console.log(`UX browser checks passed. Screenshots: ${output}`);
} finally {
  try {
    if (streakId)
      await context.request.delete(`${origin}/api/streaks/${streakId}`, {
        headers: { Origin: origin },
      });
  } finally {
    await context.close();
    await browser.close();
  }
}
