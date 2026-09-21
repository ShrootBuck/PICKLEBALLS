// Run against the disposable fixture from bun run test:social:ui.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3318/login");
  await page.goto("http://localhost:3317/posts/check-in/demo-check-1-0");
  const like = page.getByRole("button", { name: /Like comment by/ }).first();
  await like.click();
  await page.getByRole("button", { name: /Unlike comment by/ }).waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label^="Unlike comment"]')
        ?.getAttribute("disabled") === null,
  );
  assert.match(
    await page.getByRole("button", { name: /Unlike comment by/ }).innerText(),
    /1/,
  );
  await page.reload();
  await page.getByRole("button", { name: /Unlike comment by/ }).waitFor();
  await page.screenshot({
    path: "/private/tmp/comment-likes-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Unlike comment by/ })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/comment-likes-mobile.png" });
  await page.getByRole("button", { name: /Unlike comment by/ }).click();
  await page.getByRole("button", { name: /Like comment by/ }).waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label^="Like comment"]')
        ?.getAttribute("disabled") === null,
  );
  await page.reload();
  await page.getByRole("button", { name: /Like comment by/ }).waitFor();
  await page.route("**/api/likes", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Could not save your like. Try again." }),
    }),
  );
  await page.getByRole("button", { name: /Like comment by/ }).click();
  await page
    .getByText("Could not save your like. Try again.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: /Like comment by/ })
      .getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.unroute("**/api/likes");
  await page.goto("http://localhost:3317/posts/proof/demo-proof-1");
  await page
    .getByRole("button", { name: /Like comment by/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Unlike comment by/ }).waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label^="Unlike comment"]')
        ?.getAttribute("disabled") === null,
  );
  await page.reload();
  await page.getByRole("button", { name: /Unlike comment by/ }).waitFor();
  await page.getByRole("button", { name: /Unlike comment by/ }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('button[aria-label^="Like comment"]')
        ?.getAttribute("disabled") === null,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Passed: comment and verdict likes, count, reload persistence, unlike, mobile overflow, failed-save rollback.",
  );
  console.log("Browser errors:", errors);
} finally {
  await browser.close();
}
