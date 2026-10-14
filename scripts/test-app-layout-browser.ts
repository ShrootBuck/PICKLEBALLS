// Run against bun run test:fixture. Add --webkit for Safari coverage.
// Writes stay in its disposable database.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchFixtureBrowser } from "./browser-fixture";

const origin = "http://localhost:3317";
const output = "/private/tmp/pb-refinement/verified";

await mkdir(output, { recursive: true });
const browser = await launchFixtureBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));

async function ready(target = page) {
  await target.locator("#main h1").waitFor({ state: "attached" });
  await target.locator('#main [aria-busy="true"]').waitFor({ state: "hidden" });
}
async function fits(target = page) {
  const dimensions = await target.locator("#main").evaluate((main) => ({
    width: main.clientWidth,
    content: main.scrollWidth,
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert(
    dimensions.content <= dimensions.width + 1 &&
      dimensions.document <= dimensions.viewport,
    `${target.url()} overflows: ${JSON.stringify(dimensions)}`,
  );
}
async function navigate(href: string) {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const link = nav.locator(`a[href="${href}"]`);
  if (await link.count()) await link.click();
  else {
    await page.getByRole("button", { name: "Your account menu" }).click();
    await page.getByRole("menu").locator(`a[href="${href}"]`).click();
  }
  await page.waitForURL(`${origin}${href}`);
  await ready();
  await fits();
}
const needProof = () =>
  page
    .getByRole("region", { name: "Today at a glance" })
    .getByText("Need proof", { exact: true })
    .locator("..")
    .locator(".today-stat-value");
const scrollTop = () =>
  page.locator('[data-slot="app-scroll"]').evaluate((node) => node.scrollTop);

try {
  await page.goto("http://localhost:3318/login");
  await ready();
  const destinations = [
    "/feed",
    "/squad",
    "/squad?view=members",
    "/bucket-list",
    "/screen-time",
    "/history",
    "/goals",
    "/streaks",
    "/timeblock",
    "/settings",
    "/admin",
    "/changelog",
    "/",
  ];
  // Compile the fixture's routes before testing client transitions. Webpack's
  // first compilation can reload an open page while a navigation is pending.
  for (const href of destinations) {
    const response = await context.request.get(`${origin}${href}`);
    assert.equal(response.status(), 200);
  }
  console.log("Warmed the development fixture's route modules.");
  for (const href of destinations) await navigate(href);
  // Hard-load both timestamp-heavy pages to catch server/client formatting drift.
  await page.goto(`${origin}/feed`);
  await ready();
  await navigate("/");
  console.log(
    "Every desktop sidebar destination renders and stays within the page.",
  );

  const before = Number(await needProof().innerText());
  const title = `Layout task ${Date.now()}`;
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("What will you do?", { exact: true }).fill(title);
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/commitments") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  const response = await created;
  assert.equal(response.status(), 201);
  const { task } = await response.json();
  await page
    .locator('[data-slot="sheet-content"]')
    .waitFor({ state: "hidden" });
  const article = page.locator(`#task-${task.id}`);
  await article.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(Number(await needProof().innerText()), before + 1);
  await article
    .getByRole("button", { name: `Options for ${title}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit task", exact: true }).click();
  await page
    .getByLabel("What will you do?", { exact: true })
    .fill(`${title} edited`);
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await page
    .locator('[data-slot="sheet-content"]')
    .waitFor({ state: "hidden" });
  await article
    .getByRole("heading", { name: `${title} edited`, exact: true })
    .waitFor();
  assert.equal(
    Number(await needProof().innerText()),
    before + 1,
    "Editing a task must not remove it from the Need proof count",
  );
  console.log(
    "Task creation and editing keep Today and its proof count in sync.",
  );

  await navigate("/feed");
  const detail = page.locator('#main a[href^="/posts/"]').nth(4);
  await detail.scrollIntoViewIfNeeded();
  const postUrl = new URL((await detail.getAttribute("href")) as string, origin)
    .href;
  const savedScroll = await scrollTop();
  assert(savedScroll > 100);
  await detail.click();
  await page.waitForURL(postUrl);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.waitForURL(`${origin}/feed`);
  await ready();
  await page.waitForFunction(
    (top) =>
      Math.abs(
        (document.querySelector('[data-slot="app-scroll"]')?.scrollTop ?? 0) -
          top,
      ) < 3,
    savedScroll,
  );
  await navigate("/feed");
  await page.waitForFunction(
    () => document.querySelector('[data-slot="app-scroll"]')?.scrollTop === 0,
  );
  const direct = await context.newPage();
  direct.on("pageerror", (error) => errors.push(error.message));
  await direct.goto(postUrl);
  await direct.getByRole("button", { name: "Back", exact: true }).click();
  await direct.waitForURL(`${origin}/feed`);
  await direct.close();
  console.log(
    "Feed detail/back restores scroll; reselect and direct-link fallback work.",
  );

  const panelTask = page.locator('.app-panel a[href^="/?focus="]').first();
  await panelTask.click();
  await page.waitForURL(/\?focus=/);
  const focused = page.locator('article[data-focused="true"]');
  await focused.waitFor();
  assert(await focused.isVisible());

  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: width >= 768 ? 1000 : 844 });
    for (const path of [
      "/",
      "/feed",
      "/squad",
      "/squad?view=members",
      "/profile",
      "/timeblock",
      "/goals",
      "/streaks",
      "/bucket-list",
      "/screen-time",
      "/settings",
      "/admin",
      "/history",
    ]) {
      await page.goto(`${origin}${path}`);
      await ready();
      await fits();
      if (
        [
          "/",
          "/feed",
          "/profile",
          "/squad?view=members",
          "/bucket-list",
          "/settings",
          "/timeblock",
          "/screen-time",
          "/goals",
        ].includes(path)
      )
        await page.screenshot({
          path: `${output}/${width}-${path === "/" ? "today" : path.slice(1).replace("?view=", "-")}-final.png`,
        });
    }
  }
  const tabs = page.getByRole("navigation", { name: "Mobile navigation" });
  for (const href of ["/feed", "/squad", "/profile", "/"]) {
    await tabs.locator(`a[href="${href}"]`).click();
    await page.waitForURL(`${origin}${href}`);
    await ready();
    await fits();
  }
  await page
    .getByRole("navigation", { name: "Section pages" })
    .getByRole("link", { name: "Goals", exact: true })
    .click();
  await page.waitForURL(`${origin}/goals`);
  await ready();
  await tabs
    .getByRole("button", { name: "Create a task, proof, check-in, or streak" })
    .click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await sheet.getByRole("heading", { name: "What’s happening?" }).waitFor();
  await page.screenshot({ path: `${output}/320-create-final.png` });
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await sheet.waitFor({ state: "hidden" });
  await tabs.locator('a[href="/squad"]').click();
  await ready();
  await page.getByRole("button", { name: "More circle pages" }).click();
  await page.getByRole("menuitem", { name: /Screen time/ }).click();
  await page.waitForURL(`${origin}/screen-time`);
  await ready();
  await page.getByRole("button", { name: "Browse all pages" }).click();
  const allPages = page.getByRole("navigation", { name: "All pages" });
  await allPages.getByRole("link", { name: "Settings", exact: true }).click();
  await page.waitForURL(`${origin}/settings`);
  await page.locator(".app-navigation-sheet").waitFor({ state: "hidden" });
  await ready();
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("link", { name: "Account & circles" })
    .click();
  await page.getByRole("heading", { name: "Account and circles" }).waitFor();
  await fits();
  console.log(
    "320px through 1440px layouts, mobile tabs, section links and Create work.",
  );

  const name = `Layout circle ${Date.now()}`;
  const circle = await context.request.post(`${origin}/api/circles`, {
    headers: { origin },
    data: { name },
  });
  assert.equal(circle.status(), 201);
  await page.goto(origin);
  await page.getByText("No tasks yet", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: `Circle menu: ${name}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "After school", exact: true })
    .click();
  await article
    .getByRole("heading", { name: `${title} edited`, exact: true })
    .waitFor();
  await tabs.locator('a[href="/feed"]').click();
  await page.waitForURL(`${origin}/feed`);
  await ready();
  await page
    .getByRole("button", { name: "Circle menu: After school", exact: true })
    .click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await page.waitForURL(`${origin}/`);
  await page.getByText("No tasks yet", { exact: true }).waitFor();
  assert.equal(await page.locator(".social-task").count(), 0);
  console.log(
    "Circle switching refreshes Today on the same route and clears the old circle's content.",
  );

  const peer = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  peer.on("pageerror", (error) => errors.push(error.message));
  await peer.goto("http://localhost:3318/login?user=eddie");
  await ready(peer);
  await peer.getByRole("button", { name: "Your account menu" }).click();
  assert.equal(
    await peer
      .getByRole("menuitem", { name: "Owner tools", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await peer
      .getByRole("menuitem", { name: "Admin console", exact: true })
      .count(),
    0,
  );
  await peer.close();
  assert.deepEqual(errors, []);
  console.log(
    "Member navigation hides privileged tools. No browser runtime errors.",
  );
} catch (error) {
  await page
    .screenshot({ path: `${output}/layout-failure.png` })
    .catch(() => {});
  console.error("Failed at", page.url(), "Runtime errors:", errors);
  throw error;
} finally {
  await browser.close();
}
