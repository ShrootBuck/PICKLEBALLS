import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const authState = (person: string) =>
  resolve(`tests/browser/.auth/${person}.json`);

test("Discord-only entry and dead invite are clear", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Do the homework. Earn the court." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with Discord" }),
  ).toBeVisible();
  await expect(page.getByText("private app for friends")).toBeVisible();

  await page.goto("/join/not-a-real-token");
  await expect(page.getByText("This invite is dead.")).toBeVisible();
  await context.close();
});

test("bootstrap owner repairs an existing Discord account", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: authState("owner"),
  });
  const page = await context.newPage();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Owner tools" }),
  ).toBeVisible();
  await context.close();
});

test("owner creates a task and posts proof", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: authState("owner"),
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  await page.getByRole("button", { name: "Add task" }).click();
  await page
    .getByLabel("What are you actually doing?")
    .fill("Finish calculus problem set");
  await page
    .getByLabel("How do we know you did it?")
    .fill("All 18 problems solved and checked");
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page.getByText("Finish calculus problem set")).toBeVisible();

  await page.getByRole("button", { name: "Upload proof" }).click();
  await page.getByLabel("Proof photo").setInputFiles({
    name: "proof.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByLabel("What are we looking at?")
    .fill("Completed work is visible.");
  await page.getByRole("button", { name: "Post proof" }).click();
  await expect(page.getByText("Needs verdict")).toBeVisible();
  await context.close();
});

test("a peer reviews pending proof and owner tools stay role-gated", async ({
  browser,
}) => {
  // Single approval verifies (1 required)
  const miaContext = await browser.newContext({
    storageState: authState("mia"),
  });
  const miaPage = await miaContext.newPage();
  await miaPage.goto("/squad");
  await expect(miaPage.getByRole("heading", { name: "Squad" })).toBeVisible();
  await expect(
    miaPage.getByRole("button", { name: /Review proof/ }),
  ).toBeVisible();
  await miaPage.getByRole("button", { name: /Review proof/ }).click();
  await miaPage.getByText("Approve", { exact: true }).click();
  await miaPage.getByRole("button", { name: "Submit verdict" }).click();
  await miaPage.getByRole("tab", { name: "Verdicts" }).click();
  await expect(miaPage.getByText("Nothing to judge")).toBeVisible();
  await miaContext.close();

  // Owner tools stay role-gated
  const leoContext = await browser.newContext({
    storageState: authState("leo"),
  });
  const leoPage = await leoContext.newPage();
  await leoPage.goto("/squad");
  await leoPage.getByRole("tab", { name: "Verdicts" }).click();
  await expect(leoPage.getByText("Nothing to judge")).toBeVisible();

  await leoPage.goto("/admin");
  await expect(leoPage).toHaveURL(/\/$/);
  await leoContext.close();
});

test("squad members can reply to tasks and check-ins", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: authState("owner"),
  });
  const page = await context.newPage();
  const taskTitle = "Decide whether to text my ex back";
  const blocker = "Overthinking one questionable text";

  await page.goto("/");
  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("What are you actually doing?").fill(taskTitle);
  await page
    .getByLabel("How do we know you did it?")
    .fill("Make a decision and stop staring at the draft");
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page.getByText(taskTitle)).toBeVisible();

  await page.getByText("Nay", { exact: true }).click();
  await page.getByLabel("What is in the way?").fill(blocker);
  await page.getByRole("button", { name: "Post check-in" }).click();
  await expect(page.getByText("Posted. No take-backs.")).toBeVisible();

  await page.goto("/squad");
  const task = page.locator('[data-slot="item"]').filter({
    has: page.getByText(taskTitle, { exact: true }),
  });
  await task.getByRole("button", { name: "Reply", exact: true }).click();
  await task
    .getByLabel("Write a reply")
    .fill("Sleep on it. Chaos is still available tomorrow.");
  await task.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    task.getByText("Sleep on it. Chaos is still available tomorrow."),
  ).toBeVisible();

  const checkIn = page.getByText(blocker, { exact: false }).locator("..");
  await checkIn.getByRole("button", { name: "Reply", exact: true }).click();
  await checkIn
    .getByLabel("Write a reply")
    .fill("Put the phone down and finish the task first.");
  await checkIn.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(
    checkIn.getByText("Put the phone down and finish the task first."),
  ).toBeVisible();

  await context.close();
});
