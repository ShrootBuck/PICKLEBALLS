// Run against disposable accounts: bun run test:fixture.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { fixtureEnvironment, launchFixtureBrowser } from "./browser-fixture";

const browser = await launchFixtureBrowser();
const app = "http://localhost:3317";
const db = new Client({ connectionString: fixtureEnvironment.DATABASE_URL });
await db.connect();
const errors: string[] = [];
const owner = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Phoenix",
  serviceWorkers: "block",
});
const member = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Phoenix",
  serviceWorkers: "block",
});
const page = await owner.newPage();
const peer = await member.newPage();
async function openManager(tab: typeof page) {
  await tab.getByRole("button", { name: /^Circle menu:/ }).click();
  await tab
    .getByRole("menuitem", { name: "Manage circles", exact: true })
    .click();
  await tab.getByRole("heading", { name: "Circles.", exact: true }).waitFor();
}
for (const tab of [page, peer])
  tab.on("pageerror", (error) => {
    console.error(
      `Browser error at ${new URL(tab.url()).pathname}: ${error.message}`,
    );
    errors.push(error.message);
  });
const rename = (
  context: typeof owner,
  id: string,
  name: unknown,
  origin = app,
) =>
  context.request.patch(`${app}/api/circles/${id}`, {
    headers: { origin },
    data: { action: "rename", name },
  });
let createdId: string | undefined;
const original = (
  await db.query('SELECT name, slug FROM "Circle" WHERE id = $1', [
    "demo-circle",
  ])
).rows[0];
try {
  await page.goto("http://localhost:3318/login");
  await peer.goto("http://localhost:3318/login?user=eddie");
  const guest = await browser.newContext();
  assert.equal((await rename(guest, "demo-circle", "No access")).status(), 401);
  await guest.close();
  assert.equal(
    (await rename(member, "demo-circle", "No access")).status(),
    403,
  );
  assert.equal((await rename(member, "demo-other", "No access")).status(), 404);
  assert.equal(
    (
      await rename(
        owner,
        "demo-circle",
        "No access",
        "https://elsewhere.invalid",
      )
    ).status(),
    403,
  );
  for (const name of ["", "   ", "x".repeat(41), 123, null])
    assert.equal((await rename(owner, "demo-circle", name)).status(), 400);

  const inbox = await (await owner.request.get(`${app}/api/messages`)).json();
  const group = inbox.conversations.find(
    (item: { kind: string }) => item.kind === "group",
  );
  assert.ok(group);
  const body = `Our chat survives a circle rename. ${randomUUID().slice(0, 8)}`;
  const sent = await owner.request.post(`${app}/api/messages/${group.id}`, {
    headers: { origin: app },
    data: { clientId: randomUUID(), body, mediaIds: [] },
  });
  assert.equal(sent.status(), 201);
  await peer.goto(`${app}/messages?chat=${group.id}`);
  await peer
    .getByRole("textbox", { name: "Message After school", exact: true })
    .waitFor();
  await openManager(page);
  await page.getByRole("heading", { name: "Circles.", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("list", { name: "Circle members" })
      .getByRole("listitem")
      .count(),
    4,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Delete circle", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rename circle" });
  await dialog
    .getByLabel("Circle name", { exact: true })
    .fill("  Physics & film club  ");
  await dialog.getByRole("button", { name: "Save name", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page
    .getByRole("heading", { name: "Physics & film club", exact: true })
    .waitFor();
  await peer
    .getByRole("textbox", { name: "Message Physics & film club", exact: true })
    .waitFor({ timeout: 20_000 });
  await peer
    .locator('[data-slot="bubble-content"]')
    .getByText(body, { exact: true })
    .waitFor();
  assert.equal(await peer.locator(".dm-inbox-header").innerText(), "Messages.");
  assert.match(
    await peer.locator(".dm-preview-time").first().innerText(),
    /^\d{1,2}:\d{2} [AP]M$/,
  );
  assert.ok(
    await peer.locator(".dm-preview-time").first().getAttribute("title"),
  );
  const after = (
    await db.query('SELECT name, slug FROM "Circle" WHERE id = $1', [
      "demo-circle",
    ])
  ).rows[0];
  assert.equal(after.name, "Physics & film club");
  assert.equal(after.slug, original.slug);
  const renamedInbox = await (
    await owner.request.get(`${app}/api/messages`)
  ).json();
  assert.equal(
    renamedInbox.conversations.find(
      (item: { kind: string }) => item.kind === "group",
    ).id,
    group.id,
  );

  await openManager(peer);
  await peer
    .getByRole("heading", { name: "Physics & film club", exact: true })
    .waitFor();
  assert.equal(
    await peer.getByRole("button", { name: "Rename", exact: true }).count(),
    0,
  );
  assert.equal(
    await peer
      .getByRole("button", { name: "Invite & manage", exact: true })
      .count(),
    0,
  );
  await peer.getByRole("button", { name: "Circle options" }).click();
  await peer
    .getByRole("menuitem", { name: "Leave circle", exact: true })
    .waitFor();
  assert.equal(
    await peer
      .getByRole("menuitem", { name: "Delete circle", exact: true })
      .count(),
    0,
  );
  await peer.keyboard.press("Escape");

  // Let the success toast finish before changing the viewport repeatedly.
  await page
    .getByText("Circle renamed.", { exact: true })
    .waitFor({ state: "hidden" });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `No page overflow at ${width}px`,
    );
    assert.equal(
      await page
        .locator(".circles-detail")
        .evaluate((element) => element.scrollWidth > element.clientWidth),
      false,
    );
    await page.screenshot({
      path: `/private/tmp/pb-circles-${width}.png`,
      fullPage: true,
    });
  }
  // A maximum-length unbroken name must wrap without pushing controls offscreen.
  assert.equal(
    (await rename(owner, "demo-circle", "A".repeat(40))).status(),
    200,
  );
  await page
    .getByRole("heading", { name: "A".repeat(40), exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    (await rename(owner, "demo-circle", original.name)).status(),
    200,
  );
  await page
    .getByRole("heading", { name: original.name, exact: true })
    .waitFor();

  // Inspecting another circle does not switch the active circle. Opening it does.
  await page.getByRole("button", { name: /^Weekend project/ }).click();
  await page
    .getByRole("heading", { name: "Weekend project", exact: true })
    .waitFor();
  assert.equal(
    (await owner.cookies()).find((cookie) => cookie.name === "pb_active_circle")
      ?.value,
    "demo-circle",
  );
  await page.getByRole("button", { name: "Open circle", exact: true }).click();
  await page.waitForURL(`${app}/`);
  await page
    .getByRole("button", { name: "Circle menu: Weekend project", exact: true })
    .waitFor();
  await openManager(page);
  await page.getByRole("button", { name: /^After school/ }).click();
  await page
    .getByRole("button", { name: "Invite & manage", exact: true })
    .click();
  await page.waitForURL(`${app}/admin`);
  await page
    .getByRole("button", { name: "Circle menu: After school", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Create invite", exact: true })
    .waitFor();

  // Creation stays on the manager with the new circle selected, ready to invite.
  await openManager(page);
  await page.getByRole("button", { name: "New circle", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create a circle" });
  const name = `Circle test ${randomUUID().slice(0, 8)}`;
  await create.getByLabel("Circle name", { exact: true }).fill(name);
  const saved = page.waitForResponse(
    (response) =>
      response.url() === `${app}/api/circles` &&
      response.request().method() === "POST",
  );
  await create
    .getByRole("button", { name: "Create circle", exact: true })
    .click();
  createdId = (await (await saved).json()).id;
  await page.getByRole("heading", { name, exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/circles");
  assert.equal(
    await page
      .getByRole("list", { name: "Circle members" })
      .getByRole("listitem")
      .count(),
    1,
  );
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Account settings", exact: true })
    .getByRole("button", { name: "Sign out", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Passed: owner-only rename, validation/auth/origin checks, live group name and preserved chat, member controls, create/switch/invite navigation, account access, and 320–1440px layouts.",
  );
} finally {
  await db.query('UPDATE "Circle" SET name = $1 WHERE id = $2', [
    original.name,
    "demo-circle",
  ]);
  if (createdId)
    await db.query('DELETE FROM "Circle" WHERE id = $1', [createdId]);
  await db.end();
  await browser.close();
}
