import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  expect,
  test,
} from "@playwright/test";
import sharp from "sharp";
import { phoenixDateKey, phoenixLocalDateTimeValue } from "../../lib/time";
import { nextOrSameMonday, shiftDateKey } from "../../lib/timeblocks";
import {
  circleId,
  fixtureToken,
  otherCircleId,
  sessionCookie,
  testPrisma,
} from "./seed";

async function signedIn(
  browser: Browser,
  userId = "alex",
  activeCircle = circleId,
  touch = false,
) {
  const context = await browser.newContext({
    baseURL: process.env.PB_TEST_BASE_URL,
    viewport: { width: 1440, height: 1000 },
    isMobile: touch,
    hasTouch: touch,
  });
  await context.addCookies([
    {
      name: "pickle-balls.session_token",
      value: sessionCookie(userId),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    {
      name: "pb_active_circle",
      value: activeCircle,
      domain: "localhost",
      path: "/",
      sameSite: "Lax",
    },
  ]);
  return context;
}
const origin = () => ({ origin: process.env.PB_TEST_BASE_URL ?? "" });
async function newTask(api: APIRequestContext, title: string) {
  const response = await api.post("/api/commitments", {
    headers: origin(),
    data: {
      title,
      definitionOfDone: "All 18 worked solutions, checked and photographed.",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).task.id as string;
}
async function upload(api: APIRequestContext, taskId: string) {
  const buffer = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  return api.post(`/api/commitments/${taskId}/proof`, {
    headers: origin(),
    multipart: {
      image: { name: "proof.png", mimeType: "image/png", buffer },
      note: "All answers checked.",
      startedAt: phoenixLocalDateTimeValue(new Date(Date.now() - 3_600_000)),
      completedAt: phoenixLocalDateTimeValue(new Date(Date.now() - 60_000)),
    },
  });
}
async function assertNoOverflow(
  context: BrowserContext,
  route: string,
  width: number,
  screenshot: string,
) {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  const response = await page.goto(route);
  expect(response?.ok(), route).toBe(true);
  await expect(page.locator("main")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Something broke|App crashed/ }),
  ).toHaveCount(0);
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: innerWidth,
  }));
  expect(overflow.scroll, route).toBeLessThanOrEqual(overflow.width);
  await page.screenshot({ path: `test-results/audit/${screenshot}.png` });
  expect(errors, route).toEqual([]);
  await page.close();
}

test("every page fits phone, tablet and desktop without runtime errors", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  for (const width of [320, 390, 768, 1440]) {
    const context = await signedIn(browser, "alex", circleId, width < 768);
    for (const route of [
      "/",
      "/squad",
      "/history",
      "/timeblock",
      "/admin",
      "/circles",
      "/changelog",
    ]) {
      await assertNoOverflow(
        context,
        route,
        width,
        `${route.slice(1) || "today"}-${width}`,
      );
    }
    await context.close();
  }
});

test("public screens and member screens have accessible structure", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const anonymous = await browser.newContext({
    baseURL: process.env.PB_TEST_BASE_URL,
  });
  for (const route of ["/", "/sign-in", "/sign-up", `/join/${fixtureToken}`]) {
    const page = await anonymous.newPage();
    await page.goto(route);
    if (route === "/squad") {
      for (const tab of ["Board", "Proof", "Log"]) {
        await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
        const check = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          check.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
          `Squad ${tab}`,
        ).toEqual([]);
      }
    }
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      route,
    ).toEqual([]);
    await page.close();
  }
  await anonymous.close();
  const context = await signedIn(browser);
  const page = await context.newPage();
  for (const route of [
    "/",
    "/squad",
    "/history",
    "/timeblock",
    "/admin",
    "/circles",
  ]) {
    await page.goto(route);
    if (route === "/squad") {
      for (const tab of ["Board", "Proof", "Log"]) {
        await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
        const check = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        expect(
          check.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
          `Squad ${tab}`,
        ).toEqual([]);
      }
    }
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
      route,
    ).toEqual([]);
  }
  await context.close();
});

test("private records and owner actions stay inside their circle", async ({
  browser,
  request,
}) => {
  expect(
    (await request.get("/api/proofs/pending-task-proof/image")).status(),
  ).toBe(401);
  const context = await signedIn(browser, "outsider", otherCircleId);
  const api = context.request;
  expect((await api.get("/api/proofs/pending-task-proof/image")).status()).toBe(
    404,
  );
  expect(
    (
      await api.patch("/api/commitments/open-task", {
        headers: origin(),
        data: { title: "Hacked", definitionOfDone: "No" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await api.post("/api/replies", {
        headers: origin(),
        data: { targetType: "COMMITMENT", targetId: "open-task", body: "Nope" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await api.post("/api/proofs/pending-task-proof/review", {
        headers: origin(),
        data: { decision: "APPROVED" },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await api.patch("/api/notifications/audit-notification", {
        headers: origin(),
        data: { read: true },
      })
    ).status(),
  ).toBe(404);
  const member = await signedIn(browser, "robin");
  expect(
    (
      await member.request.post("/api/admin/invites", {
        headers: origin(),
        data: { label: "Unauthorized invite" },
      })
    ).status(),
  ).toBe(404);
  await context.close();
  await member.close();
});

test("all circle mutations reject cross-site and unproven requests", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  for (const path of [
    "/api/circles",
    "/api/circles/active",
    "/api/circles/join",
    "/api/commitments",
    "/api/check-in",
    "/api/replies",
    "/api/push/subscriptions",
  ]) {
    for (const headers of [{}, { origin: "https://hostile.invalid" }] as Record<
      string,
      string
    >[]) {
      expect(
        (await context.request.post(path, { headers, data: {} })).status(),
        path,
      ).toBe(403);
    }
  }
  await context.close();
});

test("malformed dates, cookies, payloads and push URLs fail safely", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await context.addCookies([
    { name: "pb_active_circle", value: "%ZZ", domain: "localhost", path: "/" },
  ]);
  for (const route of [
    "/",
    "/circles",
    "/history?day=2026-99-99",
    "/timeblock?due=2026-99-99",
  ]) {
    expect((await page.goto(route))?.ok(), route).toBe(true);
    await expect(page.getByText("App crashed.")).toHaveCount(0);
  }
  const api = context.request;
  expect(
    (
      await api.post("/api/commitments", {
        headers: { ...origin(), "content-type": "application/json" },
        data: "{",
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.get("/api/notifications?cursor=garbage%20date", {
        headers: origin(),
      })
    ).status(),
  ).toBe(400);
  for (const endpoint of [
    "http://127.0.0.1:5432/",
    "https://localhost/push",
    "https://example.com/push",
    "https://fcm.googleapis.com.evil.invalid/push",
  ]) {
    expect(
      (
        await api.post("/api/push/subscriptions", {
          headers: origin(),
          data: { endpoint, keys: { p256dh: "invalid", auth: "invalid" } },
        })
      ).status(),
    ).toBe(400);
  }
  const badTime = await api.post("/api/timeblocks/pdf", {
    headers: origin(),
    data: { dueMonday: "2026-99-99", tasks: [] },
  });
  expect(badTime.status()).toBe(400);
  await context.close();
});

test("proof submission and verdicts remain consistent under concurrent requests", async ({
  browser,
}) => {
  const owner = await signedIn(browser);
  const taskId = await newTask(owner.request, "Concurrency regression");
  const uploads = await Promise.all([
    upload(owner.request, taskId),
    upload(owner.request, taskId),
  ]);
  expect(uploads.map((r) => r.status()).sort()).toEqual([201, 409]);
  const uploaded = uploads.find((r) => r.status() === 201);
  if (!uploaded) throw new Error("Neither upload succeeded.");
  const proof = (await uploaded.json()).proof;
  expect(
    (
      await owner.request.patch(`/api/commitments/${taskId}`, {
        headers: origin(),
        data: { title: "Moved goalposts", definitionOfDone: "Do less" },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await owner.request.post(`/api/proofs/${proof.id}/review`, {
        headers: origin(),
        data: { decision: "APPROVED" },
      })
    ).status(),
  ).toBe(403);
  const sam = await signedIn(browser, "sam");
  const jules = await signedIn(browser, "jules");
  const reviews = await Promise.all([
    sam.request.post(`/api/proofs/${proof.id}/review`, {
      headers: origin(),
      data: { decision: "APPROVED" },
    }),
    jules.request.post(`/api/proofs/${proof.id}/review`, {
      headers: origin(),
      data: { decision: "CHALLENGED", note: "Missing last page." },
    }),
  ]);
  expect(reviews.map((r) => r.status()).sort()).toEqual([201, 409]);
  const db = testPrisma();
  try {
    const row = await db.commitment.findUniqueOrThrow({
      where: { id: taskId },
      include: { proofs: { include: { reviews: true } } },
    });
    expect(row.proofs).toHaveLength(1);
    expect(row.proofs[0].reviews).toHaveLength(1);
    expect(row.status).toBe(
      row.proofs[0].reviews[0].decision === "APPROVED" ? "VERIFIED" : "OPEN",
    );
  } finally {
    await db.$disconnect();
  }
  await owner.close();
  await sam.close();
  await jules.close();
});

test("approved promises cannot be rewritten and closed days reject proof", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  expect(
    (
      await context.request.patch("/api/commitments/approved-task", {
        headers: origin(),
        data: { title: "Rewrite verified work", definitionOfDone: "Changed" },
      })
    ).status(),
  ).toBe(409);
  const page = await context.newPage();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Unfinished from earlier" }),
  ).toHaveCount(0);
  await expect(page.locator("#task-old-task")).toHaveCount(0);
  const response = await upload(context.request, "old-task");
  expect(response.status()).toBe(409);
  expect((await response.json()).error).toContain("This day is closed");
  await context.close();
});

test("deep links open task replies, old proof, and the correct circle", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.goto("/squad?focus=open-task");
  await expect(
    page.getByRole("tab", { name: "Board", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page
      .locator("#thread-open-task")
      .getByRole("textbox", { name: "Write a reply" }),
  ).toBeVisible();
  await page.goto("/squad?focus=old-proof-task-proof");
  await expect(page.getByRole("tab", { name: /^Proof/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByText("Last week's practice exam", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to today" })).toBeVisible();
  await page.goto(`/squad?circle=${otherCircleId}&focus=other-task`);
  await expect(
    page.getByText("Private task in the other circle", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Today", exact: true }).click();
  await expect(
    page.getByText("Finish the physics problem set and check every answer", {
      exact: true,
    }),
  ).toHaveCount(0);
  await context.close();
});

test("refresh updates friend activity while preserving a typed draft", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.goto("/");
  await page
    .getByLabel("What is in the way?")
    .fill("Keep this unfinished draft");
  const id = await newTask(context.request, "Task added in another tab");
  await page.getByRole("button", { name: "Refresh board" }).click();
  await expect(page.locator(`#task-${id}`)).toBeVisible();
  await expect(page.getByLabel("What is in the way?")).toHaveValue(
    "Keep this unfinished draft",
  );
  await context.close();
});

test("notification settings save and optional task notifications are delivered", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /notifications/ }).click();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "New and edited tasks" }).check();
  await expect(
    page.getByRole("checkbox", { name: "New and edited tasks" }),
  ).toBeEnabled();
  const prefs = await context.request.get("/api/notifications/preferences", {
    headers: origin(),
  });
  expect((await prefs.json()).preferences.taskCreated).toBe(true);
  const sam = await signedIn(browser, "sam");
  await newTask(sam.request, "An optional squad notification");
  await expect
    .poll(async () => {
      const r = await context.request.get("/api/notifications", {
        headers: origin(),
      });
      return (await r.json()).notifications.some(
        (n: { body: string }) => n.body === "An optional squad notification",
      );
    })
    .toBe(true);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    axe.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await context.close();
  await sam.close();
});

test("mobile navigation closes and upload errors keep the form usable", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("link", { name: /^Squad/ }).click();
  await expect(
    page.getByRole("heading", { name: "Squad", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/");
  await page
    .locator("#task-open-task")
    .getByRole("button", { name: "Upload proof" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Post proof" }).click();
  await expect(
    dialog.getByText("Attach a photo first. Words are cheap."),
  ).toBeVisible();
  await dialog.screenshot({
    path: "test-results/audit/upload-dialog-mobile.png",
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await context.close();
});

test("invites distinguish equal circle names and one link admits one new member", async ({
  browser,
}) => {
  const outsider = await signedIn(browser, "outsider", otherCircleId);
  const page = await outsider.newPage();
  await page.goto(`/join/${fixtureToken}`);
  await expect(page.getByText(/already in/)).toHaveCount(0);
  const newcomer = await signedIn(browser, "newcomer");
  const results = await Promise.all([
    outsider.request.post("/api/circles/join", {
      headers: origin(),
      data: { token: fixtureToken },
    }),
    newcomer.request.post("/api/circles/join", {
      headers: origin(),
      data: { token: fixtureToken },
    }),
  ]);
  expect(results.filter((r) => r.ok())).toHaveLength(1);
  expect(
    results
      .filter((r) => !r.ok())
      .every((r) => [404, 409].includes(r.status())),
  ).toBe(true);
  await outsider.close();
  await newcomer.close();
});

test("PDF endpoint returns a valid document and rejects impossible schedules", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const dueMonday = nextOrSameMonday(phoenixDateKey());
  const day = shiftDateKey(dueMonday, -2);
  const data = {
    dueMonday,
    tasks: [
      {
        id: "manual",
        title: "Physics practice",
        startedAt: `${day}T16:00`,
        completedAt: `${day}T17:00`,
      },
    ],
  };
  const result = await context.request.post("/api/timeblocks/pdf", {
    headers: origin(),
    data,
  });
  expect(result.status()).toBe(200);
  expect((await result.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(
    (
      await context.request.post("/api/timeblocks/pdf", {
        headers: origin(),
        data: {
          ...data,
          tasks: [{ ...data.tasks[0], completedAt: `${day}T15:00` }],
        },
      })
    ).status(),
  ).toBe(400);
  await context.close();
});

test("timeblock drafts survive reload and remain separate from original tasks and other circles", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/timeblock");
  const name = page.getByLabel("Task 1 name", { exact: true });
  await name.fill("Report wording only");
  await page.reload();
  await expect(name).toHaveValue("Report wording only");
  const db = testPrisma();
  try {
    expect(
      (
        await db.commitment.findUniqueOrThrow({
          where: { id: "approved-task" },
        })
      ).title,
    ).toBe("Read chapter 4");
  } finally {
    await db.$disconnect();
  }
  await page.goto(`/squad?circle=${otherCircleId}`);
  await expect(
    page.getByRole("heading", { name: "Squad", exact: true }),
  ).toBeVisible();
  await page.goto("/timeblock");
  await expect(page.locator('input[value="Report wording only"]')).toHaveCount(
    0,
  );
  await context.close();
});

test("long conversations keep newest replies visible and can load earlier replies", async ({
  browser,
}) => {
  const db = testPrisma();
  const createdAt = new Date(Date.now() - 60_000);
  try {
    await db.socialReply.createMany({
      data: Array.from({ length: 55 }, (_, index) => ({
        id: `audit-long-reply-${String(index).padStart(2, "0")}`,
        commitmentId: "open-task",
        circleId,
        authorId: "sam",
        body: `Conversation message ${index}`,
        createdAt,
      })),
    });
  } finally {
    await db.$disconnect();
  }
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.goto("/squad?focus=open-task");
  const thread = page.locator("#thread-open-task");
  await expect(
    thread.getByText("Conversation message 54", { exact: true }),
  ).toBeVisible();
  await expect(
    thread.getByText("Conversation message 0", { exact: true }),
  ).toHaveCount(0);
  await thread.getByRole("button", { name: "Load earlier replies" }).click();
  await expect(
    thread.getByText("Conversation message 0", { exact: true }),
  ).toBeVisible();
  await expect(
    thread.getByRole("button", { name: "Load earlier replies" }),
  ).toHaveCount(0);
  const outsider = await signedIn(browser, "outsider", otherCircleId);
  const response = await outsider.request.get(
    "/api/replies?targetType=COMMITMENT&targetId=open-task",
  );
  expect((await response.json()).replies).toEqual([]);
  await outsider.close();
  await context.close();
});

test("check-ins and replies can be posted, edited and removed within their rules", async ({
  browser,
}) => {
  const context = await signedIn(browser, "robin");
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Nay", exact: true }).click();
  await page
    .getByLabel("What is in the way?")
    .fill("Stuck on the final problem");
  await page.getByRole("button", { name: "Post check-in" }).click();
  await expect(
    page.getByText("Stuck on the final problem", { exact: true }).first(),
  ).toBeVisible();
  const reply = await context.request.post("/api/replies", {
    headers: origin(),
    data: {
      targetType: "COMMITMENT",
      targetId: "open-task",
      body: "I can help after dinner",
    },
  });
  expect(reply.status()).toBe(201);
  const id = (await reply.json()).reply.id;
  const edited = await context.request.patch(`/api/replies/${id}`, {
    headers: origin(),
    data: { body: "I can help at 7" },
  });
  expect(edited.status()).toBe(200);
  const sam = await signedIn(browser, "sam");
  expect(
    (
      await sam.request.delete(`/api/replies/${id}`, { headers: origin() })
    ).status(),
  ).toBe(403);
  expect(
    (
      await context.request.delete(`/api/replies/${id}`, { headers: origin() })
    ).status(),
  ).toBe(200);
  await sam.close();
  await context.close();
});

test("task rate limits are atomic and cron reconciliation is idempotent", async ({
  browser,
  request,
}) => {
  const context = await signedIn(browser, "robin");
  const results = await Promise.all(
    Array.from({ length: 32 }, (_, index) =>
      context.request.post("/api/commitments", {
        headers: origin(),
        data: {
          title: `Rate limit fixture ${index}`,
          definitionOfDone: "A completed page",
        },
      }),
    ),
  );
  expect(results.filter((r) => r.status() === 201)).toHaveLength(30);
  expect(results.filter((r) => r.status() === 429)).toHaveLength(2);
  const db = testPrisma();
  try {
    await db.commitment.create({
      data: {
        id: "audit-cron-task",
        circleId,
        userId: "robin",
        title: "Yesterday without proof",
        definitionOfDone: "A completed page",
        day: new Date(`${shiftDateKey(phoenixDateKey(), -1)}T00:00:00Z`),
        dueAt: new Date(Date.now() - 60_000),
      },
    });
    expect((await request.get("/api/cron/reconcile")).status()).toBe(404);
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (
          await request.get("/api/cron/reconcile", {
            headers: { authorization: "Bearer browser-test-cron" },
          })
        ).status(),
      ).toBe(200);
    expect(
      (
        await db.commitment.findUniqueOrThrow({
          where: { id: "audit-cron-task" },
        })
      ).status,
    ).toBe("MISSED");
    expect(
      await db.activityEvent.count({
        where: { entityId: "audit-cron-task", kind: "TASK_MISSED" },
      }),
    ).toBe(1);
  } finally {
    await db.$disconnect();
  }
  await context.close();
});

test("a phone photo uploads through the form and challenged proof can be replaced", async ({
  browser,
}) => {
  const context = await signedIn(browser, "alex", circleId, true);
  const id = await newTask(context.request, "Phone photo regression");
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await page
    .locator(`#task-${id}`)
    .getByRole("button", { name: "Upload proof" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Prove it: Phone photo regression",
  });
  const buffer = await sharp({
    create: { width: 3200, height: 2400, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: "phone-photo.png", mimeType: "image/png", buffer });
  await dialog
    .getByLabel("Started", { exact: true })
    .fill(phoenixLocalDateTimeValue(new Date(Date.now() - 3_600_000)));
  await dialog
    .getByLabel("Finished", { exact: true })
    .fill(phoenixLocalDateTimeValue(new Date(Date.now() - 60_000)));
  await dialog
    .locator("textarea")
    .fill("All pages and answers are in the photo.");
  await dialog.getByRole("button", { name: "Post proof" }).click();
  await expect(dialog).toHaveCount(0);
  const db = testPrisma();
  try {
    const proof = await db.taskProof.findFirstOrThrow({
      where: { commitmentId: id },
      include: { image: true },
    });
    expect(proof.image?.width).toBe(2048);
    expect(proof.image?.height).toBe(1536);
    expect(proof.image?.mimeType).toBe("image/webp");
    const sam = await signedIn(browser, "sam");
    expect(
      (
        await sam.request.post(`/api/proofs/${proof.id}/review`, {
          headers: origin(),
          data: { decision: "CHALLENGED", note: "The last page is missing." },
        })
      ).status(),
    ).toBe(201);
    const replacement = await upload(context.request, id);
    expect(replacement.status()).toBe(201);
    const replacementId = (await replacement.json()).proof.id;
    expect(
      (await db.taskProof.findUniqueOrThrow({ where: { id: proof.id } }))
        .replacedById,
    ).toBe(replacementId);
    expect(await db.taskProof.count({ where: { commitmentId: id } })).toBe(2);
    await sam.close();
  } finally {
    await db.$disconnect();
  }
  await context.close();
});

test("notification pagination does not skip simultaneous events and invalid read states fail cleanly", async ({
  browser,
}) => {
  const db = testPrisma();
  try {
    await db.notification.createMany({
      data: Array.from({ length: 35 }, (_, index) => ({
        id: `audit-page-${String(index).padStart(2, "0")}`,
        recipientId: "jules",
        actorId: "sam",
        circleId,
        kind: "REPLY_POSTED",
        entityId: "open-task",
        title: "Reply",
        body: `Batch ${index}`,
        createdAt: new Date("2026-09-04T12:00:00Z"),
      })),
    });
  } finally {
    await db.$disconnect();
  }
  const context = await signedIn(browser, "jules");
  let cursor: string | null = null;
  const ids: string[] = [];
  do {
    const response: APIResponse = await context.request.get(
      `/api/notifications${cursor ? `?cursor=${cursor}` : ""}`,
      { headers: origin() },
    );
    const result: {
      notifications: { id: string }[];
      nextCursor: string | null;
    } = await response.json();
    ids.push(...result.notifications.map((row: { id: string }) => row.id));
    cursor = result.nextCursor;
  } while (cursor);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.filter((id) => id.startsWith("audit-page-"))).toHaveLength(35);
  expect(
    (
      await context.request.patch("/api/notifications/audit-page-00", {
        headers: origin(),
        data: null,
      })
    ).status(),
  ).toBe(400);
  await context.close();
});

test("immutable proof images remain available offline", async ({ browser }) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const readImage = () =>
    page.evaluate(async () => {
      const response = await fetch("/api/proofs/pending-task-proof/image");
      return {
        status: response.status,
        cache: response.headers.get("cache-control"),
        size: (await response.blob()).size,
      };
    });
  const first = await readImage();
  expect(first.status).toBe(200);
  expect(first.cache).toContain("immutable");
  expect(first.size).toBeGreaterThan(0);
  await context.setOffline(true);
  expect(await readImage()).toEqual(first);
  await context.close();
});

test("squad columns stack independently and keep mobile order", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.goto("/squad");
  await page.getByRole("tab", { name: "Board", exact: true }).click();
  const board = page.getByRole("tabpanel", { name: "Board", exact: true });
  const positions = () =>
    board.locator('[data-slot="card"][style]').evaluateAll((cards) =>
      cards
        .map((card) => {
          const rect = card.getBoundingClientRect();
          return {
            order: Number((card as HTMLElement).style.order),
            x: rect.x,
            y: rect.y,
            bottom: rect.bottom,
          };
        })
        .sort((a, b) => a.order - b.order),
    );
  const desktop = await positions();
  expect(desktop.length).toBeGreaterThanOrEqual(3);
  expect(desktop[2].x).toBe(desktop[0].x);
  expect(desktop[2].y - desktop[0].bottom).toBeCloseTo(16, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await positions();
  for (let index = 1; index < mobile.length; index++) {
    expect(mobile[index].y).toBeGreaterThanOrEqual(mobile[index - 1].bottom);
  }
  await context.close();
});

test("countdown changes on system second boundaries", async ({ browser }) => {
  const context = await signedIn(browser);
  const page = await context.newPage();
  await page.goto("/");
  const timer = page.getByRole("timer").first();
  await expect(timer).toBeVisible();
  const now = await page.evaluate(() => Date.now());
  await page.clock.install({ time: now });
  await page.clock.pauseAt(Math.ceil(now / 1000) * 1000 + 1350);
  // Visibility resync also covers returning from a throttled background tab.
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  const initial = await timer.innerText();
  await page.clock.runFor(649);
  await expect(timer).toHaveText(initial);
  await page.clock.runFor(1);
  await expect(timer).not.toHaveText(initial);
  await context.close();
});
