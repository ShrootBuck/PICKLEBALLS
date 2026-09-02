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
    page.getByRole("heading", { name: "Tiny squad administration." }),
  ).toBeVisible();
  await context.close();
});

test("owner creates a task and posts proof", async ({ browser }) => {
  const context = await browser.newContext({
    storageState: authState("owner"),
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Promises. Then go play." }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByLabel("Task").fill("Finish calculus problem set");
  await page
    .getByLabel("Definition of done")
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
  await page.getByLabel("Note to the squad").fill("Completed work is visible.");
  await page.getByRole("button", { name: "Post proof" }).click();
  await expect(page.getByText("Awaiting review")).toBeVisible();
  await context.close();
});

test("a peer reviews pending proof and owner tools stay role-gated", async ({
  browser,
}) => {
  // First approval — still needs one more (2 required)
  const miaContext = await browser.newContext({
    storageState: authState("mia"),
  });
  const miaPage = await miaContext.newPage();
  await miaPage.goto("/squad");
  await expect(
    miaPage.getByRole("heading", { name: /Accountability/ }),
  ).toBeVisible();
  await expect(
    miaPage.getByRole("button", { name: /Review proof/ }),
  ).toBeVisible();
  await miaPage.getByRole("button", { name: /Review proof/ }).click();
  await miaPage.getByText("Approve", { exact: true }).click();
  await miaPage.getByRole("button", { name: "Submit verdict" }).click();
  await expect(miaPage.getByText("1/2 approvals")).toBeVisible();
  await miaContext.close();

  // Second approval — now verified and queue empty
  const leoContext = await browser.newContext({
    storageState: authState("leo"),
  });
  const leoPage = await leoContext.newPage();
  await leoPage.goto("/squad");
  await expect(
    leoPage.getByRole("button", { name: /Review proof/ }),
  ).toBeVisible();
  await leoPage.getByRole("button", { name: /Review proof/ }).click();
  await leoPage.getByText("Approve", { exact: true }).click();
  await leoPage.getByRole("button", { name: "Submit verdict" }).click();
  await expect(leoPage.getByText("No proof waiting")).toBeVisible();

  await leoPage.goto("/admin");
  await expect(leoPage).toHaveURL(/\/$/);
  await leoContext.close();
});

test("daily and weekly Screen Time live in their own flow", async ({
  browser,
}) => {
  const context = await browser.newContext({
    storageState: authState("owner"),
  });
  const page = await context.newPage();
  await page.goto("/screen-time");
  await expect(
    page.getByRole("heading", { name: /Screen Time/ }),
  ).toBeVisible();
  await expect(page.getByText("Daily", { exact: true })).toBeVisible();
  await expect(page.getByText("Weekly", { exact: true })).toBeVisible();
  await context.close();
});
