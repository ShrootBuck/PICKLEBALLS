// Run against bun run test:fixture. Add --webkit for Safari coverage.
import assert from "node:assert/strict";
import type { WorkSessionView } from "@/lib/work-session-policy";
import { launchFixtureBrowser } from "./browser-fixture";

const origin = "http://localhost:3317";
const browser = await launchFixtureBrowser();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
  reducedMotion: "reduce",
});
page.setDefaultTimeout(30_000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const bar = page.getByRole("region", { name: "Running stopwatch" });
async function recorded(taskId?: string): Promise<{
  active: WorkSessionView | null;
  sessions: WorkSessionView[];
}> {
  const response = await page.request.get(
    `${origin}/api/work-sessions${taskId ? `?taskId=${taskId}` : ""}`,
  );
  assert.equal(response.status(), 200);
  return response.json();
}
try {
  const hydrated = page.waitForResponse((response) =>
    response.url().endsWith("/api/work-sessions"),
  );
  await page.goto("http://localhost:3318/login");
  await hydrated;
  const tasks: { id: string; title: string }[] = [];
  for (const letter of ["A", "B"]) {
    const response = await page.request.post(`${origin}/api/commitments`, {
      headers: { origin },
      data: {
        title: `Switch timer ${letter} ${Date.now()}`,
        circleId: "demo-circle",
      },
    });
    assert.equal(response.status(), 201);
    tasks.push((await response.json()).task);
  }
  const rehydrated = page.waitForResponse((response) =>
    response.url().endsWith("/api/work-sessions"),
  );
  await page.reload();
  await rehydrated;
  const card = (index: number) => page.locator(`#task-${tasks[index].id}`);
  await card(0)
    .getByRole("button", { name: "Start timer", exact: true })
    .click();
  await bar.waitFor();
  const first = (await recorded()).active;
  assert(first);

  await page.route("**/api/work-sessions", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Switch temporarily unavailable." }),
    });
  });
  await card(1)
    .getByRole("button", { name: "Switch timer", exact: true })
    .click();
  await page
    .getByText("Switch temporarily unavailable.", { exact: true })
    .waitFor();
  assert.equal((await recorded()).active?.id, first.id);
  await page.unroute("**/api/work-sessions");

  let active = first;
  for (const [index, width] of [320, 390, 768, 1440].entries()) {
    const destination = (index + 1) % 2;
    await page.setViewportSize({ width, height: 1000 });
    const switched = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/work-sessions") &&
        response.request().method() === "POST",
    );
    await card(destination)
      .getByRole("button", { name: "Switch timer", exact: true })
      .click();
    assert.equal((await switched).status(), 201);
    await bar.getByText(tasks[destination].title, { exact: true }).waitFor();
    const current = (await recorded()).active;
    assert(current);
    assert.equal(current.taskId, tasks[destination].id);
    assert.notEqual(current.id, active.id);
    const previous = (await recorded(active.taskId)).sessions.find(
      (session) => session.id === active.id,
    );
    assert.equal(previous?.endedAt, current.startedAt);
    assert.equal(
      (await recorded(tasks[destination].id)).sessions.filter(
        (session) => !session.endedAt,
      ).length,
      1,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await card(destination)
      .getByRole("button", { name: "Stop timer", exact: true })
      .waitFor();
    await page.screenshot({
      path: `/private/tmp/pb-switch-timer-${width}.png`,
    });
    active = current;
  }
  await bar.getByRole("button", { name: "Stop", exact: true }).click();
  await bar.waitFor({ state: "hidden" });
  assert.equal((await recorded()).active, null);
  assert.equal((await recorded(tasks[0].id)).sessions.length, 3);
  assert.equal((await recorded(tasks[1].id)).sessions.length, 2);
  assert.deepEqual(errors, []);
  console.log(
    "Switch failure/retry, shared timestamps, separate resumed intervals, one active timer, and 320/390/768/1440px layouts passed.",
  );
} finally {
  await browser.close();
}
