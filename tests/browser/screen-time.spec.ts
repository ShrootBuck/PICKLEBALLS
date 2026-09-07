import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, test } from "@playwright/test";
import {
  latestScreenTimeWeek,
  validateScreenTimeExtraction,
} from "../../lib/screen-time";
import { requireDateKey } from "../../lib/time";
import { shiftDateKey } from "../../lib/timeblocks";
import { circleId, otherCircleId, sessionCookie, testPrisma } from "./seed";

const week = latestScreenTimeWeek();
const origin = () => ({ origin: process.env.PB_TEST_BASE_URL ?? "" });
async function signedIn(
  browser: Browser,
  userId = "alex",
  activeCircle = circleId,
) {
  const context = await browser.newContext({
    baseURL: process.env.PB_TEST_BASE_URL,
    viewport: { width: 1440, height: 1100 },
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

test("weekly screen time: upload, review, publish, leaderboard, history and private drafts", async ({
  browser,
}) => {
  const context = await signedIn(browser);
  const friend = await signedIn(browser, "sam");
  const outsider = await signedIn(browser, "outsider", otherCircleId);
  const db = testPrisma();
  const page = await context.newPage();
  try {
    for (const [userId, start, minutes] of [
      ["sam", week, 180],
      ["sam", shiftDateKey(week, -7), 210],
      ["alex", shiftDateKey(week, -7), 180],
    ] as const) {
      const reading = await db.screenTimeReading.create({
        data: {
          userId,
          circleId,
          weekStart: requireDateKey(start),
          dailyAverageMinutes: minutes,
          mediaId: `i_history_${userId}_${start}`,
        },
      });
      await db.screenTimeSubmission.create({
        data: {
          userId,
          circleId,
          weekStart: requireDateKey(start),
          readingId: reading.id,
        },
      });
    }
    await page.goto("/");
    await expect(
      page.getByText("Your weekly screen time is missing"),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Upload screen time", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Screen Time", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("This Week", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText(/no calendar dates are needed/)).toBeVisible();
    let draftId = "";
    let mediaId = "";
    // Fixtures replace only the external vision step. Upload/finalization,
    // read recovery, confirmation, storage permissions and all page queries run normally.
    await page.route("**/api/screen-time/read", async (route) => {
      const body = route.request().postDataJSON();
      mediaId = body.mediaId;
      const reading = await db.screenTimeReading.create({
        data: {
          userId: "alex",
          circleId,
          weekStart: requireDateKey(week),
          ...validateScreenTimeExtraction({
            isWeeklyReport: true,
            dailyAverageMinutes: 226,
            totalMinutes: 1587,
          }),
          mediaId,
        },
      });
      draftId = reading.id;
      await db.mediaUpload.update({
        where: { id: mediaId },
        data: { claimed: true },
      });
      await route.continue();
    });
    const sharp = (await import("sharp")).default;
    const buffer = await sharp({
      create: { width: 500, height: 900, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await page
      .getByLabel("Weekly screenshot", { exact: true })
      .setInputFiles({ name: "week.png", mimeType: "image/png", buffer });
    await page
      .getByRole("button", { name: "Read screenshot", exact: true })
      .click();
    await expect(page.getByText("Check the read before posting")).toBeVisible();
    expect(
      await db.screenTimeSubmission.count({
        where: { userId: "alex", circleId, weekStart: requireDateKey(week) },
      }),
    ).toBe(0);
    expect((await friend.request.get(`/api/media/${mediaId}`)).status()).toBe(
      404,
    );
    expect((await context.request.get(`/api/media/${mediaId}`)).status()).toBe(
      200,
    );
    await page.getByRole("button", { name: "Confirm and post" }).click();
    await expect(page.getByText("3h 46m per day submitted")).toBeVisible();
    const alex = page.getByRole("row").filter({ hasText: "Alex Rivera (you)" });
    await expect(alex).toContainText("46m more");
    await expect(
      page.getByRole("row").filter({ hasText: "Sam Chen" }),
    ).toContainText("Most improved");
    await expect(
      page.getByRole("row").filter({ hasText: "Jules Park" }),
    ).toContainText("Not submitted");
    expect((await friend.request.get(`/api/media/${mediaId}`)).status()).toBe(
      200,
    );
    expect((await outsider.request.get(`/api/media/${mediaId}`)).status()).toBe(
      404,
    );
    const retry = await context.request.post("/api/screen-time", {
      headers: origin(),
      data: { readingId: draftId, circleId, dailyAverageMinutes: 0 },
    });
    expect(retry.status()).toBe(200);
    const saved = await db.screenTimeSubmission.findMany({
      where: { userId: "alex", circleId, weekStart: requireDateKey(week) },
      include: { reading: true },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].reading.dailyAverageMinutes).toBe(226);
    expect(
      (
        await friend.request.post("/api/screen-time", {
          headers: origin(),
          data: { readingId: draftId, circleId },
        })
      ).status(),
    ).toBe(409);
    await page.locator('[data-slot="dashboard-scroll"]').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: "/tmp/pickleballs-screen-time-desktop.png",
      fullPage: true,
    });
    expect(
      (await new AxeBuilder({ page }).include("#main").analyze()).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page
        .getByRole("list", { name: "Weekly rankings" })
        .getByText("3h 46m per day", { exact: true }),
    ).toBeVisible();
    await page.locator('[data-slot="dashboard-scroll"]').evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: "/tmp/pickleballs-screen-time-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).include("#main").analyze()).violations,
    ).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.unroute("**/api/screen-time/read");
    await page.route("**/api/screen-time/read", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "The screenshot reader is unavailable. Try again shortly.",
        }),
      }),
    );
    await page.getByLabel("Weekly screenshot", { exact: true }).setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer,
    });
    await page
      .getByRole("button", { name: "Read screenshot", exact: true })
      .click();
    await expect(
      page.getByText(
        "The screenshot reader is unavailable. Try again shortly.",
        { exact: true },
      ),
    ).toBeVisible();
    const unchanged = await db.screenTimeSubmission.findUniqueOrThrow({
      where: {
        userId_circleId_weekStart: {
          userId: "alex",
          circleId,
          weekStart: requireDateKey(week),
        },
      },
      include: { reading: true },
    });
    expect(unchanged.reading.dailyAverageMinutes).toBe(226);
    await page.goto("/");
    await expect(
      page.getByText("Your weekly screen time is missing"),
    ).toHaveCount(0);
    await page.goto(`/screen-time?week=${shiftDateKey(week, -7)}`);
    await expect(page.getByText("This week is archived")).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "Alex Rivera (you)" }),
    ).toContainText("3h 0m");
  } finally {
    await db.$disconnect();
    await context.close();
    await friend.close();
    await outsider.close();
  }
});

test("screen-time APIs reject stale weeks, invalid media, wrong circles and unauthorized writes", async ({
  browser,
}) => {
  const context = await signedIn(browser, "robin");
  const db = testPrisma();
  try {
    const stale = await context.request.post("/api/screen-time/read", {
      headers: origin(),
      data: { mediaId: "i_fake", circleId, weekStart: shiftDateKey(week, 7) },
    });
    expect(stale.status()).toBe(409);
    const unavailable = await context.request.post("/api/screen-time/read", {
      headers: origin(),
      data: { mediaId: "i_fake", circleId, weekStart: week },
    });
    expect(unavailable.status()).toBe(400);
    expect(
      (
        await context.request.post("/api/screen-time/read", {
          headers: origin(),
          data: { mediaId: "v_fake", circleId, weekStart: week },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await context.request.post("/api/screen-time", {
          headers: { origin: "https://evil.invalid" },
          data: { readingId: "fake", circleId },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post("/api/screen-time", {
          headers: origin(),
          data: { readingId: "fake", circleId: otherCircleId },
        })
      ).status(),
    ).toBe(409);
    const old = await db.screenTimeReading.create({
      data: {
        userId: "robin",
        circleId,
        weekStart: requireDateKey(shiftDateKey(week, -7)),
        dailyAverageMinutes: 10,
        mediaId: "i_stale_robin",
      },
    });
    expect(
      (
        await context.request.post("/api/screen-time", {
          headers: origin(),
          data: { readingId: old.id, circleId },
        })
      ).status(),
    ).toBe(409);
    const page = await context.newPage();
    await page.goto("/screen-time?week=2026-02-30");
    await expect(
      page.getByText("Latest completed week", { exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
    await context.close();
  }
});

test("weekly reminders respect preferences, skip submissions and deduplicate concurrent cron retries", async ({
  browser,
}) => {
  const context = await signedIn(browser, "robin");
  const db = testPrisma();
  try {
    await db.notificationPreference.upsert({
      where: { userId: "jules" },
      create: { userId: "jules", screenTime: false },
      update: { screenTime: false },
    });
    expect((await context.request.get("/api/cron/screen-time")).status()).toBe(
      404,
    );
    const headers = { authorization: "Bearer browser-test-cron" };
    const responses = await Promise.all([
      context.request.get("/api/cron/screen-time", { headers }),
      context.request.get("/api/cron/screen-time", { headers }),
    ]);
    for (const response of responses)
      expect(response.status(), await response.text()).toBe(200);
    const rows = await db.notification.findMany({
      where: { kind: "SCREEN_TIME_REMINDER", circleId },
    });
    expect(rows.filter((row) => row.recipientId === "robin")).toHaveLength(1);
    expect(rows.some((row) => row.recipientId === "jules")).toBe(false);
    expect(
      rows.some(
        (row) => row.recipientId === "alex" || row.recipientId === "sam",
      ),
    ).toBe(false);
    expect(rows[0].data).toMatchObject({
      url: `/screen-time?week=${week}&circle=${circleId}`,
    });
    const page = await context.newPage();
    await page.goto("/settings");
    await page.getByRole("button", { name: /notifications/i }).click();
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await expect(
      page.getByText("Weekly screen time", { exact: true }),
    ).toBeVisible();
  } finally {
    await db.$disconnect();
    await context.close();
  }
});
