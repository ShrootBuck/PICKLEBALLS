// Run against bun run test:social:ui. All writes use disposable test accounts.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "http://localhost:3317";
const output = "/private/tmp/pb-goals";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3318/login");
  await page.goto(`${origin}/goals`);
  await page
    .getByRole("heading", { name: "Small steps. Bigger things." })
    .waitFor();
  await page
    .getByRole("link", { name: "Reach 1600 on Codeforces", exact: true })
    .waitFor();
  await page.screenshot({
    path: `${output}/goals-desktop.png`,
    caret: "initial",
  });
  await page.getByRole("button", { name: "New goal", exact: true }).click();
  const title = `Browser goal ${Date.now()}`;
  await page.getByLabel("The goal", { exact: true }).fill(title);
  await page
    .getByLabel("What would success look like? (optional)")
    .fill("Finish a small project and show the work.");
  await page
    .getByLabel("Milestones (optional)")
    .fill("Make the first draft\nShare it with the circle");
  await page.getByRole("button", { name: "Create goal", exact: true }).click();
  await page.waitForURL(/\/goals\/[^/?]+$/);
  const goalUrl = page.url();
  const goalId = goalUrl.split("/").at(-1) as string;
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Complete goal", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("checkbox", {
      name: "Make the first draft",
      exact: true,
    })
    .click();
  await page.getByText("1 of 2 milestones complete", { exact: true }).waitFor();
  await page.reload();
  await page.getByText("1 of 2 milestones complete", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add a task", exact: true }).click();
  await page
    .getByLabel("What will you do?", { exact: true })
    .fill("Write the first scene");
  await page.getByRole("combobox").waitFor();
  await page.waitForFunction(
    () =>
      !document.querySelector('[role="combobox"]')?.hasAttribute("disabled"),
  );
  assert.match(await page.getByRole("combobox").innerText(), new RegExp(title));
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page
    .getByRole("heading", { name: "Write the first scene", exact: true })
    .waitFor();
  const existingTaskTitle = `Existing task ${Date.now()}`;
  const existingTask = await context.request.post(`${origin}/api/commitments`, {
    headers: { Origin: origin },
    data: { circleId: "demo-circle", title: existingTaskTitle },
  });
  assert.equal(existingTask.status(), 201);
  await page.reload();
  await page
    .getByRole("button", { name: "Link existing", exact: true })
    .click();
  await page.getByLabel("Find a task", { exact: true }).fill(existingTaskTitle);
  await page
    .getByRole("button", { name: existingTaskTitle, exact: true })
    .click();
  await page
    .getByRole("heading", { name: existingTaskTitle, exact: true })
    .waitFor();
  await page
    .getByRole("checkbox", {
      name: "Share it with the circle",
      exact: true,
    })
    .click();
  await page.getByText("2 of 2 milestones complete", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Complete goal", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reopen goal", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Reopen goal", exact: true }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("button", { name: "Reopen goal", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Reopen goal", exact: true }).click();
  await page.getByRole("button", { name: "Edit goal", exact: true }).click();
  await page
    .getByLabel("What would success look like? (optional)")
    .fill("A finished project, with a clear next step.");
  await page.getByLabel("Target date (optional)").fill("2027-06-01");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await page
    .getByText("A finished project, with a clear next step.", { exact: true })
    .waitFor();
  console.log(
    "Goals: create, edit, milestones, persistence, new and existing task links, completion, archive, reopen passed.",
  );

  const peer = await browser.newContext({ serviceWorkers: "block" });
  const peerPage = await peer.newPage();
  await peerPage.goto("http://localhost:3318/login?user=eddie");
  await peerPage.goto(goalUrl);
  await peerPage.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(
    await peerPage
      .getByRole("button", { name: "Edit goal", exact: true })
      .count(),
    0,
  );
  const forbidden = await peer.request.patch(`${origin}/api/goals/${goalId}`, {
    headers: { Origin: origin },
    data: { action: "status", status: "ARCHIVED" },
  });
  assert.equal(forbidden.status(), 403);
  const csrf = await context.request.post(`${origin}/api/goals`, {
    headers: { Origin: "https://example.invalid" },
    data: { title: "Bad", circleId: "demo-circle" },
  });
  assert.equal(csrf.status(), 403);
  await peer.close();

  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.goto(`${origin}/goals/demo-goal-codeforces`);
  await page
    .getByRole("heading", { name: "Reach 1600 on Codeforces", exact: true })
    .waitFor();
  await page.screenshot({
    path: `${output}/goal-mobile.png`,
    caret: "initial",
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole("button", { name: "Circle menu: After school", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Goals", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await context.request.post(`${origin}/api/circles/active`, {
    headers: { Origin: origin },
    data: { circleId: "demo-other" },
  });
  assert.equal(
    (
      await context.request.patch(`${origin}/api/goals/${goalId}`, {
        headers: { Origin: origin },
        data: { action: "status", status: "ARCHIVED" },
      })
    ).status(),
    404,
  );
  assert.deepEqual(errors, []);
  console.log(
    `Browser checks passed at 1440px, 390px, and 320px. Screenshots: ${output}`,
  );
} finally {
  await browser.close();
}
