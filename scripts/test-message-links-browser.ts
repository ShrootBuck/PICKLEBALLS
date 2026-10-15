import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureEnvironment, launchFixtureBrowser } from "./browser-fixture";

Object.assign(process.env, fixtureEnvironment);
const { getPrisma } = await import("../lib/prisma");
const db = getPrisma();
const browser = await launchFixtureBrowser();
const circle = await db.circle.create({
  data: {
    name: "Notification link circle",
    slug: randomUUID(),
    memberships: { create: { userId: "demo-you" } },
  },
});
try {
  const group = await db.directConversation.create({
    data: { circleId: circle.id },
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3318/login");
  await page.locator(".app-shell").waitFor();
  await page.goto("http://localhost:3317/messages");
  await page.getByRole("heading", { name: "Messages." }).waitFor();
  const dm = await db.directConversation.findFirstOrThrow({
    where: { userAId: "demo-eddie", userBId: "demo-you" },
  });
  await page.goto(
    `http://localhost:3317/messages?chat=${group.id}&circle=${circle.id}`,
  );
  await page
    .getByRole("textbox", {
      name: "Message Notification link circle",
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await context.cookies()).find(
      (cookie) => cookie.name === "pb_active_circle",
    )?.value,
    circle.id,
  );
  await page.goto(`http://localhost:3317/messages?chat=${dm.id}`);
  const composer = page.getByRole("textbox", {
    name: "Message Eddie",
    exact: true,
  });
  await composer.waitFor();
  // Refresh the inbox through its public event to exercise the client API path.
  await page.evaluate(() =>
    window.dispatchEvent(new Event("pb:messages-changed")),
  );
  await page.reload();
  await composer.waitFor();
  const result = await page.request.get(
    `http://localhost:3317/api/messages?chat=${dm.id}`,
  );
  assert.equal(result.status(), 200);
  assert(
    (await result.json()).conversations.some(
      (item: { id: string }) => item.id === dm.id,
    ),
  );
  await page.goto("http://localhost:3317/messages?circle=not-a-membership");
  // Streamed Next pages can return HTTP 200 while rendering notFound().
  await page.getByText("Not found.", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("textbox", { name: /^Message / }).count(),
    0,
  );
  assert.equal(
    (await context.cookies()).find(
      (cookie) => cookie.name === "pb_active_circle",
    )?.value,
    circle.id,
  );
  console.log(
    "Group alert links switch circles; DM alert links survive reload outside the current directory; unauthorized circle links are rejected.",
  );
} finally {
  await browser.close();
  await db.circle.delete({ where: { id: circle.id } });
  await db.$disconnect();
}
