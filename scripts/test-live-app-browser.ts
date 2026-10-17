// Run against bun run test:fixture. Every write uses disposable local accounts.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { parseTimeblockRoutine } from "@/lib/timeblock-routine";
import { fixtureEnvironment, launchFixtureBrowser } from "./browser-fixture";

const origin = "http://localhost:3317";
const browser = await launchFixtureBrowser();
const db = new Client({ connectionString: fixtureEnvironment.DATABASE_URL });
await db.connect();
const suffix = randomUUID().slice(0, 8);
const taskId = `live-task-${suffix}`;
const proofId = `live-proof-${suffix}`;
const title = `Live proof ${suffix}`;
const errors: string[] = [];
let goalId: string | undefined;
let savedRoutine: unknown;
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  const author = await browser.newContext({ serviceWorkers: "block" });
  await context.request.get("http://localhost:3318/login", { maxRedirects: 0 });
  await author.request.get("http://localhost:3318/login?user=eddie", {
    maxRedirects: 0,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  let suppressChanges = false;
  await page.routeWebSocket("**/api/realtime", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (suppressChanges && JSON.parse(String(message)).type === "refresh")
        return;
      socket.send(message);
    });
  });
  await page.goto(`${origin}/squad`);
  const review = page.getByRole("region", {
    name: "Proofs needing your verdict",
  });
  await review.waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page.getByRole("button", { name: "Refresh posts" }).count(),
    0,
  );

  await db.query(
    `INSERT INTO "Commitment" (id,"userId","circleId",day,title,"dueAt",status,"updatedAt","requiredApprovals")
     SELECT $1,'demo-eddie','demo-circle',day,$2,"dueAt",'AWAITING_REVIEW',now(),1 FROM "Commitment" WHERE id='demo-task-0'`,
    [taskId, title],
  );
  await db.query(
    `INSERT INTO "TaskProof" (id,"commitmentId","ownerId","circleId","startedAt","completedAt","isLate")
     VALUES ($1,$2,'demo-eddie','demo-circle',now()-interval '20 minutes',now()-interval '1 minute',false)`,
    [proofId, taskId],
  );
  const post = review.getByRole("article").filter({ hasText: title });
  await post.waitFor({ timeout: 10_000 });
  await post.getByRole("button", { name: /^Open \d+ comments$/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Proof and comments",
    exact: true,
  });
  const draft = dialog.getByRole("textbox");
  await draft.fill("Keep this unfinished comment");
  const comment = `Reply from another device ${suffix}`;
  let failReads = 1;
  await page.route("**/api/replies?**", (route) => {
    if (failReads-- > 0)
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: "{}",
      });
    return route.continue();
  });
  const reply = await author.request.post(`${origin}/api/replies`, {
    headers: { origin },
    data: { targetType: "PROOF", targetId: proofId, body: comment },
  });
  assert.equal(reply.status(), 201, await reply.text());
  await dialog.getByText(comment, { exact: true }).waitFor({ timeout: 10_000 });
  assert.equal(await draft.inputValue(), "Keep this unfinished comment");
  assert.equal(await dialog.getByText("Could not load comments.").count(), 0);
  await page.unroute("**/api/replies?**");
  await db.query('DELETE FROM "SocialReply" WHERE "proofId"=$1 AND body=$2', [
    proofId,
    comment,
  ]);
  await dialog
    .getByText(comment, { exact: true })
    .waitFor({ state: "hidden", timeout: 10_000 });
  assert.equal(await draft.inputValue(), "Keep this unfinished comment");
  await page.keyboard.press("Escape");

  const verdict = await context.request.post(
    `${origin}/api/proofs/${proofId}/review`,
    {
      headers: { origin },
      data: { decision: "APPROVED", note: "Checked the completed work." },
    },
  );
  assert.equal(verdict.status(), 201, await verdict.text());
  await post.waitFor({ state: "hidden", timeout: 10_000 });

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Review overflow at ${width}px`,
    );
    await page.screenshot({ path: `/private/tmp/pb-live-review-${width}.png` });
  }
  console.log(
    "Review: live arrival and verdict removal; open comments: reply, deletion, failed-read recovery and draft preservation; 320/390/768/1440px.",
  );

  await page.setViewportSize({ width: 1440, height: 960 });
  const created = await context.request.post(`${origin}/api/goals`, {
    headers: { origin },
    data: {
      circleId: "demo-circle",
      title: `Live goal ${suffix}`,
      milestones: [],
    },
  });
  assert.equal(created.status(), 201, await created.text());
  const { goal } = await created.json();
  goalId = goal.id;
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Goals", exact: true })
    .click();
  await page.getByRole("link", { name: goal.title, exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  const renamed = `Updated across devices ${suffix}`;
  await db.query('UPDATE "Goal" SET title=$1 WHERE id=$2', [renamed, goal.id]);
  await page
    .getByRole("link", { name: renamed, exact: true })
    .waitFor({ timeout: 10_000 });
  await page.waitForLoadState("networkidle");

  // Drop a valid change event while the socket stays live. Focus must still
  // recover server-rendered data independently of the socket's ready event.
  suppressChanges = true;
  const missed = `Recovered on focus ${suffix}`;
  await db.query('UPDATE "Goal" SET title=$1 WHERE id=$2', [missed, goal.id]);
  await page.waitForTimeout(500);
  assert.equal(
    await page.getByRole("link", { name: missed, exact: true }).count(),
    0,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page
    .getByRole("link", { name: missed, exact: true })
    .waitFor({ timeout: 10_000 });
  suppressChanges = false;
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: missed, exact: true }).click();
  await page.getByRole("button", { name: "Add a task", exact: true }).click();
  await page
    .getByLabel("What will you do?", { exact: true })
    .fill("Keep this task draft");
  const picker = page.getByRole("combobox");
  await picker.filter({ hasText: missed }).waitFor();
  const pickerTitle = `Live picker goal ${suffix}`;
  await db.query('UPDATE "Goal" SET title=$1 WHERE id=$2', [
    pickerTitle,
    goal.id,
  ]);
  await picker.filter({ hasText: pickerTitle }).waitFor({ timeout: 10_000 });
  assert.equal(
    await page.getByLabel("What will you do?", { exact: true }).inputValue(),
    "Keep this task draft",
  );
  await page.keyboard.press("Escape");
  await page.waitForLoadState("networkidle");
  console.log(
    "Goals: cross-device updates, missed-event recovery on focus, and a live goal picker without losing the task draft.",
  );

  // Simulate a network/proxy that accepts ordinary HTTP but cannot establish
  // the live channel. No focus, reload or manual refresh triggers recovery.
  const degraded = await context.newPage();
  degraded.on("pageerror", (error) => errors.push(error.message));
  await degraded.routeWebSocket("**/api/realtime", () => {});
  await degraded.goto(`${origin}/goals`);
  await degraded
    .getByRole("link", { name: pickerTitle, exact: true })
    .waitFor();
  await degraded.waitForLoadState("networkidle");
  const recovered = `Automatic HTTP recovery ${suffix}`;
  await db.query('UPDATE "Goal" SET title=$1 WHERE id=$2', [
    recovered,
    goal.id,
  ]);
  await degraded
    .getByRole("link", { name: recovered, exact: true })
    .waitFor({ timeout: 20_000 });
  console.log(
    "Blocked WebSocket: server-rendered data catches up automatically over HTTP.",
  );
  await degraded.close();

  await page.waitForLoadState("networkidle");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Timeblock", exact: true })
    .click();
  await page.locator("#timeblock-routine").waitFor();
  await page.waitForLoadState("networkidle");
  savedRoutine = (
    await db.query(
      'SELECT "timeblockRoutine" FROM "User" WHERE id=\'demo-you\'',
    )
  ).rows[0].timeblockRoutine;
  const routine = parseTimeblockRoutine(savedRoutine);
  const className = `Live class ${suffix}`;
  const remoteRoutine = {
    ...routine,
    schedule: null,
    classes: { ...routine.classes, "1": className },
  };
  await db.query(
    'UPDATE "User" SET "timeblockRoutine"=$1 WHERE id=\'demo-you\'',
    [JSON.stringify(remoteRoutine)],
  );
  await page.waitForFunction(
    (expected) =>
      document.querySelector<HTMLInputElement>("#period-1")?.value === expected,
    className,
    { timeout: 10_000 },
  );
  await page
    .locator("#timeblock-routine")
    .getByRole("button", { name: /Set up routine|Edit routine/ })
    .click();
  await page
    .getByLabel("Period 1", { exact: true })
    .fill("Keep my unsaved routine");
  const updated = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/timeblock" &&
      response.request().headers().rsc === "1",
  );
  await db.query(
    'UPDATE "User" SET "timeblockRoutine"=$1 WHERE id=\'demo-you\'',
    [
      JSON.stringify({
        ...remoteRoutine,
        classes: { ...remoteRoutine.classes, "1": "Changed elsewhere" },
      }),
    ],
  );
  await updated;
  await page.waitForLoadState("networkidle");
  assert.equal(
    await page.getByLabel("Period 1", { exact: true }).inputValue(),
    "Keep my unsaved routine",
  );
  console.log(
    "Timeblock: saved routine changes arrive from another device while unsaved edits stay intact.",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await db.query('DELETE FROM "Commitment" WHERE id=$1', [taskId]);
  if (goalId) await db.query('DELETE FROM "Goal" WHERE id=$1', [goalId]);
  if (savedRoutine !== undefined)
    await db.query(
      'UPDATE "User" SET "timeblockRoutine"=$1 WHERE id=\'demo-you\'',
      [savedRoutine === null ? null : JSON.stringify(savedRoutine)],
    );
  await db.end();
}
