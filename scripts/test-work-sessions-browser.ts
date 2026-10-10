// Run while bun run test:social:ui serves its disposable fixture.
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { Client } from "pg";
import { chromium, type Page } from "playwright";
import { phoenixDateKey, phoenixLocalDateTimeValue } from "@/lib/time";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import { nextOrSameMonday, timeblockWeek } from "@/lib/timeblocks";
import type { WorkSessionView } from "@/lib/work-session-policy";

const origin = "http://localhost:3317";
const environment = await Bun.file(
  "/private/tmp/pb-social-test-env.json",
).json();
if (
  environment.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(environment.DATABASE_URL).hostname !== "127.0.0.1"
)
  throw new Error("Use the disposable UI fixture.");
const fixtureDb = new Client({ connectionString: environment.DATABASE_URL });
await fixtureDb.connect();
await fixtureDb.query(
  `DELETE FROM "Commitment" WHERE "userId" = 'demo-you' AND (title LIKE 'Physics stopwatch %' OR title = 'Second stopwatch task')`,
);
await fixtureDb.end();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
});
page.setDefaultTimeout(30000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
async function api(target: Page, path: string, method = "GET", body?: unknown) {
  return target.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, data: await response.json() };
    },
    { path, method, body },
  );
}
const bar = () => page.getByRole("region", { name: "Running stopwatch" });
const due = nextOrSameMonday(phoenixDateKey());
const draftKey = `pb-timeblock:demo-you:demo-circle:${due}`;
const readDraft = () =>
  page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) || "{}").rows as TimeblockDraftRow[],
    draftKey,
  );
let taskId = "";

try {
  await page.goto("http://localhost:3318/login");
  const title = `Physics stopwatch ${crypto.randomUUID().slice(0, 6)}`;
  const created = await api(page, "/api/commitments", "POST", {
    title,
    circleId: "demo-circle",
  });
  assert.equal(created.status, 201);
  taskId = created.data.task.id;
  const other = await api(page, "/api/commitments", "POST", {
    title: "Second stopwatch task",
    circleId: "demo-circle",
  });
  assert.equal(other.status, 201);
  await page.goto(`${origin}/profile?tab=tasks`);
  const task = () => page.locator(`#task-${taskId}`);
  await task().getByRole("button", { name: "Start", exact: true }).click();
  await bar().waitFor();
  assert.equal(
    (await api(page, "/api/work-sessions")).data.active.taskId,
    taskId,
  );
  assert(
    await page
      .locator(`#task-${other.data.task.id}`)
      .getByRole("button", { name: "Start", exact: true })
      .isDisabled(),
  );
  await page.reload();
  await bar().waitFor();
  await page.waitForTimeout(500);
  await page
    .getByRole("link", { name: "Timeblock", exact: true })
    .first()
    .click();
  await page.waitForURL("**/timeblock");
  await bar().waitFor();
  await page.waitForTimeout(2000);
  let stopwatchRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/work-sessions")) stopwatchRequests++;
  });
  const before = stopwatchRequests;
  const elapsedBefore = await bar().getByRole("timer").innerText();
  await page.waitForTimeout(2200);
  assert.notEqual(await bar().getByRole("timer").innerText(), elapsedBefore);
  assert.equal(
    stopwatchRequests,
    before,
    "The stopwatch must not poll the server on each tick",
  );
  console.log(
    "Start, navigation, reload recovery and local-only ticking passed.",
  );

  const device = await browser.newContext({
    storageState: await page.context().storageState(),
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  const phone = await device.newPage();
  phone.on("pageerror", (error) => errors.push(error.message));
  await phone.goto(`${origin}/profile?tab=tasks`);
  const phoneBar = phone.getByRole("region", { name: "Running stopwatch" });
  await phoneBar.waitFor();
  await phone.screenshot({
    path: "/private/tmp/pb-stopwatch-mobile-running.png",
  });
  await phoneBar.getByRole("button", { name: "Stop", exact: true }).click();
  await phoneBar.waitFor({ state: "hidden" });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await bar().waitFor({ state: "hidden" });
  await page.goto(`${origin}/profile?tab=tasks`);
  await task().getByRole("button", { name: "Resume", exact: true }).click();
  await bar().waitFor();
  await page.waitForTimeout(1200);
  await bar().getByRole("button", { name: "Stop", exact: true }).click();
  await bar().waitFor({ state: "hidden" });
  const result = await api(page, `/api/work-sessions?taskId=${taskId}`);
  assert.equal(result.data.sessions.length, 2);
  console.log(
    "Second-device recovery, Stop and separate resumed intervals passed.",
  );

  await task()
    .getByRole("button", { name: `Recorded time for ${title}` })
    .click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await dialog
    .getByRole("button", { name: "Edit", exact: true })
    .first()
    .waitFor();
  // Monday still shows the report for the week that just ended.
  const base =
    Math.min(
      Math.floor(Date.now() / 60_000) * 60_000,
      timeblockWeek(due).endAtExclusive.getTime(),
    ) -
    120 * 60_000;
  for (const [index, from, to] of [
    [0, 0, 25],
    [1, 40, 70],
  ]) {
    await dialog
      .getByRole("button", { name: "Edit", exact: true })
      .nth(index)
      .click();
    await dialog
      .getByLabel("Started", { exact: true })
      .fill(phoenixLocalDateTimeValue(new Date(base + from * 60_000)));
    await dialog
      .getByLabel("Finished", { exact: true })
      .fill(phoenixLocalDateTimeValue(new Date(base + to * 60_000)));
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes("/api/work-sessions/") &&
        response.request().method() === "PATCH",
    );
    await dialog
      .getByRole("button", { name: "Save times", exact: true })
      .click();
    assert.equal((await saved).status(), 200);
    await dialog
      .getByRole("button", { name: "Edit", exact: true })
      .first()
      .waitFor();
    await page.waitForTimeout(300);
  }
  await dialog
    .getByText("00:55:00 recorded across 2 sessions.", { exact: false })
    .waitFor();
  await page.screenshot({ path: "/private/tmp/pb-stopwatch-sessions.png" });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`${origin}/timeblock`);
  await page.waitForFunction(
    ({ key }) =>
      JSON.parse(localStorage.getItem(key) || "{}").rows?.filter(
        (row: TimeblockDraftRow) => row.sessionId,
      ).length >= 2,
    { key: draftKey },
  );
  let rows = (await readDraft()).filter((row) =>
    result.data.sessions.some(
      (session: WorkSessionView) => row.sessionId === session.id,
    ),
  );
  assert.equal(rows.length, 2);
  assert.equal(
    rows.reduce(
      (sum, row) =>
        sum +
        Date.parse(`${row.completedAt}-07:00`) -
        Date.parse(`${row.startedAt}-07:00`),
      0,
    ),
    55 * 60_000,
  );
  await page.screenshot({ path: "/private/tmp/pb-stopwatch-timeblock.png" });
  console.log(
    "Manual corrections and two Timeblock intervals totaling 55 minutes passed.",
  );

  await page.goto(`${origin}/profile?tab=tasks`);
  await task().getByRole("button", { name: "Post proof", exact: true }).click();
  const proofDialog = page.locator(
    '[data-slot="sheet-content"][data-mode="proof"]',
  );
  await proofDialog
    .locator('input[type="file"]')
    .first()
    .setInputFiles("/private/tmp/pb-proof-fixture.png");
  await proofDialog.getByRole("button", { name: "Next", exact: true }).click();
  await proofDialog.getByText("Recorded work", { exact: true }).waitFor();
  assert.equal(
    await proofDialog.locator('input[type="datetime-local"]').count(),
    0,
  );
  assert(await proofDialog.getByText("00:55:00", { exact: true }).isVisible());
  await page.screenshot({ path: "/private/tmp/pb-stopwatch-proof.png" });
  const posted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/commitments/${taskId}/proof`) &&
      response.request().method() === "POST",
  );
  await proofDialog
    .getByRole("button", { name: "Post proof", exact: true })
    .click();
  const proofResponse = await posted;
  assert.equal(proofResponse.status(), 201, await proofResponse.text());
  await proofDialog.waitFor({ state: "hidden" });
  await page.waitForURL(`${origin}/`);
  await page.goto(`${origin}/timeblock`);
  await page.getByRole("button", { name: "Export PDF", exact: true }).waitFor();
  rows = await readDraft();
  assert.equal(
    rows.filter((row) =>
      result.data.sessions.some(
        (session: WorkSessionView) => row.sessionId === session.id,
      ),
    ).length,
    2,
  );
  assert(
    !rows.some((row) => row.id === taskId),
    "Proof must not duplicate recorded work",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await (await downloaded).saveAs("/private/tmp/pb-stopwatch-report.pdf");
  assert.equal(
    (
      await PDFDocument.load(
        await Bun.file("/private/tmp/pb-stopwatch-report.pdf").arrayBuffer(),
      )
    ).getPageCount(),
    2,
  );
  console.log(
    "Proof autofill, no duplicate blocks and two-page PDF export passed.",
  );

  await phone.goto(`${origin}/profile?tab=tasks`);
  await phone
    .locator(`#task-${other.data.task.id}`)
    .getByRole("button", { name: "Start", exact: true })
    .click();
  await phoneBar.waitFor();
  await phone.setViewportSize({ width: 320, height: 740 });
  assert(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await phone.screenshot({ path: "/private/tmp/pb-stopwatch-mobile-320.png" });
  await phoneBar.getByRole("button", { name: "Stop", exact: true }).click();
  await phoneBar.waitFor({ state: "hidden" });
  await phone
    .locator(`#task-${taskId}`)
    .getByRole("button", { name: `Recorded time for ${title}` })
    .click();
  await phone
    .locator('[data-slot="dialog-content"]')
    .getByRole("button", { name: "Edit", exact: true })
    .first()
    .waitFor();
  await phone.waitForTimeout(350);
  await phone.screenshot({
    path: "/private/tmp/pb-stopwatch-mobile-sessions.png",
  });
  assert(
    await phone.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  const phoneDialog = phone.locator('[data-slot="dialog-content"]');
  await phoneDialog
    .getByRole("button", { name: "Edit", exact: true })
    .first()
    .click();
  await phoneDialog.getByLabel("Started", { exact: true }).waitFor();
  await phone.screenshot({ path: "/private/tmp/pb-stopwatch-mobile-edit.png" });
  assert(
    await phoneDialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  );
  const unauthenticated = await browser.newContext();
  assert.equal(
    (await unauthenticated.request.get(`${origin}/api/work-sessions`)).status(),
    401,
  );
  const denied = await phone.request.post(`${origin}/api/work-sessions`, {
    headers: { origin: "https://not-pickleballs.invalid" },
    data: { id: crypto.randomUUID(), taskId, circleId: "demo-circle" },
  });
  assert.equal(denied.status(), 403);
  const peer = await browser.newPage({ serviceWorkers: "block" });
  await peer.goto("http://localhost:3318/login?user=eddie");
  const peerProfile = await peer.request.get(
    `${origin}/members/demo-you?tab=tasks`,
  );
  assert.equal(peerProfile.status(), 200);
  const peerMarkup = await peerProfile.text();
  for (const session of result.data.sessions as WorkSessionView[])
    assert(
      !peerMarkup.includes(session.id),
      "Other members must not receive private session data",
    );
  assert.equal(
    (await api(peer, `/api/work-sessions?taskId=${taskId}`)).status,
    404,
  );
  assert.equal(
    (
      await api(
        peer,
        `/api/work-sessions/${result.data.sessions[0].id}`,
        "PATCH",
        { action: "stop" },
      )
    ).status,
    404,
  );
  assert.deepEqual(errors, []);
  console.log(
    "320px/390px layouts, authentication, origin and ownership checks passed. No browser runtime errors.",
  );
} catch (error) {
  await page
    .screenshot({ path: "/private/tmp/pb-stopwatch-failure.png" })
    .catch(() => {});
  console.error(
    (
      await page
        .locator("body")
        .innerText()
        .catch(() => "")
    ).slice(-3500),
  );
  console.error("Runtime errors:", errors);
  throw error;
} finally {
  await browser.close();
}
