// Run against bun run test:fixture. All writes use disposable accounts.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchFixtureBrowser } from "./browser-fixture";

const browser = await launchFixtureBrowser();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  serviceWorkers: "block",
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = "/private/tmp/pb-streaks-verified";
await mkdir(output, { recursive: true });
const origin = "http://localhost:3317";
async function saveResponse(action: () => Promise<unknown>, method = "PATCH") {
  const response = page.waitForResponse(
    (response) =>
      response.url().includes("/api/streaks") &&
      response.request().method() === method,
  );
  await action();
  const result = await response;
  assert(result.ok(), await result.text());
  return result.json();
}
async function screenshot(name: string, fullPage = false) {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    await Promise.all(
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage });
}
async function fits() {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Page overflows horizontally",
  );
  const dialog = page.locator('[data-slot="dialog-content"]');
  if (await dialog.count()) {
    const box = await dialog.boundingBox();
    assert(
      box &&
        box.x >= 0 &&
        box.x + box.width <= 391 &&
        box.y >= 0 &&
        box.y + box.height <= 845,
      "Dialog is outside the mobile viewport",
    );
  }
}
try {
  await page.goto("http://localhost:3318/login");
  await page.goto(`${origin}/streaks`);
  await page.getByRole("button", { name: "New streak", exact: true }).click();
  let dialog = page.locator('[data-slot="dialog-content"]');
  await dialog
    .getByLabel("Name", { exact: true })
    .fill("School day browser check");
  assert.equal(
    await dialog.getByText("Which days count?", { exact: true }).count(),
    0,
  );
  await screenshot("mobile-default");
  await fits();
  await dialog.getByRole("button", { name: "Every day", exact: true }).click();
  await dialog
    .locator('[data-slot="toggle-group-item"]')
    .filter({ hasText: /^Weekdays$/ })
    .click();
  await screenshot("mobile-weekdays");
  assert.equal(
    await dialog
      .locator('[data-slot="toggle-group-item"]')
      .filter({ hasText: /^Weekdays$/ })
      .getAttribute("aria-pressed"),
    "true",
  );
  await fits();
  const created = await saveResponse(
    () =>
      dialog.getByRole("button", { name: "Start streak", exact: true }).click(),
    "POST",
  );
  const id = created.streak.id;
  await page.locator(`a[href*="/streaks/${id}"]`).first().click();
  await page.waitForURL(`**/streaks/${id}*`);
  await page.getByRole("button", { name: "Take a break", exact: true }).click();
  dialog = page.locator('[data-slot="dialog-content"]');
  await dialog
    .getByRole("heading", { name: "Take a break", exact: true })
    .waitFor();
  assert.equal(await dialog.locator('input[type="date"]').count(), 0);
  await screenshot("mobile-break");
  await fits();
  await saveResponse(() =>
    dialog.getByRole("button", { name: /Rest of this week/ }).click(),
  );
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Log a slip", exact: true }).count(),
    0,
  );
  await page.getByText("Off day", { exact: true }).first().waitFor();
  await screenshot("mobile-paused", true);
  await fits();
  await saveResponse(() =>
    page.getByRole("button", { name: "Resume", exact: true }).click(),
  );
  await page
    .getByRole("button", { name: "Take a break", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Take a break", exact: true })
    .waitFor();

  await page.getByRole("button", { name: "Streak options" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  dialog = page.locator('[data-slot="dialog-content"]');
  await dialog.getByRole("button", { name: "Weekdays", exact: true }).click();
  await dialog
    .locator('[data-slot="toggle-group-item"]')
    .filter({ hasText: /^Custom$/ })
    .click();
  await dialog.getByRole("button", { name: "Tuesday", exact: true }).click();
  await dialog.getByRole("button", { name: "Thursday", exact: true }).click();
  await screenshot("mobile-custom");
  assert.equal(
    await dialog
      .getByRole("button", { name: "Thursday", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await fits();
  await saveResponse(() =>
    dialog.getByRole("button", { name: "Save changes", exact: true }).click(),
  );
  await page.getByText(/Mon, Wed, Fri from/).waitFor();
  await page.reload();
  await page.getByText(/Mon, Wed, Fri from/).waitFor();
  // Reopening must read saved values, including after the controlled form unmounts.
  await page.getByRole("button", { name: "Streak options" }).click();
  await page.getByRole("menuitem", { name: "Edit details" }).click();
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Mon, Wed, Fri", exact: true })
    .waitFor();
  await page
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Cancel", exact: true })
    .click();

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Take a break", exact: true }).click();
  await saveResponse(() =>
    page
      .locator('[data-slot="dialog-content"]')
      .getByRole("button", { name: /Until I resume/ })
      .click(),
  );
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await screenshot("desktop-paused", true);
  assert.deepEqual(errors, []);
  console.log(
    "Streak browser checks passed: optional setup, weekdays, custom days, persisted breaks, resume, mobile fit, and no client errors.",
  );
  console.log(`Screenshots: ${output}`);
} finally {
  await context.close();
  await browser.close();
}
