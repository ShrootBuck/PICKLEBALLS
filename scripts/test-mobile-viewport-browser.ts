// Run against bun run test:fixture. --webkit also checks Safari's layout engine.
// Simulate the visual viewport independently of the layout viewport, as a
// phone's keyboard and browser chrome do. Resizing the browser alone misses this.
import assert from "node:assert/strict";
import { launchFixtureBrowser } from "./browser-fixture";

const browser = await launchFixtureBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
  });
  await context.addInitScript(() => {
    const viewport = window.visualViewport;
    if (!viewport)
      throw new Error("VisualViewport is required for this check.");
    let height: number | null = null;
    let top = 0;
    let scale = 1;
    Object.defineProperties(viewport, {
      height: { get: () => height ?? innerHeight },
      offsetTop: { get: () => top },
      scale: { get: () => scale },
    });
    window.addEventListener("test:viewport", (event) => {
      ({ height, top, scale } = (event as CustomEvent).detail);
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  await page.goto("http://localhost:3318/login");
  await page.locator(".app-shell").waitFor();
  const inbox = await (
    await context.request.get("http://localhost:3317/api/messages")
  ).json();
  const chat = inbox.conversations.find(
    (item: { person: { id: string } | null }) =>
      item.person?.id === "demo-eddie",
  ).id;
  await page.close();

  for (const width of [320, 390, 768, 1440]) {
    for (const path of ["/", "/feed", "/settings", `/messages?chat=${chat}`]) {
      // Separate pages avoid WebKit reporting aborted background requests as
      // access-control failures during repeated hard document navigations.
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`http://localhost:3317${path}`);
      await page
        .locator('#main [aria-busy="true"]')
        .waitFor({ state: "hidden" });
      await page
        .locator(path.startsWith("/messages") ? ".dm-composer" : "#main h1")
        .waitFor();
      for (const viewport of [
        { height: 740, top: 0, scale: 1 }, // browser chrome expanded
        { height: 360, top: 48, scale: 1 }, // keyboard open and viewport panned
        { height: 360, top: 0, scale: 1 },
        { height: 844, top: 0, scale: 1 }, // keyboard dismissed
      ]) {
        await page.evaluate((detail) => {
          window.dispatchEvent(new CustomEvent("test:viewport", { detail }));
        }, viewport);
        await page.waitForFunction(
          ({ height, top }) =>
            document.documentElement.style.getPropertyValue(
              "--visual-viewport-height",
            ) === `${height}px` &&
            document.documentElement.style.getPropertyValue(
              "--visual-viewport-top",
            ) === `${top}px`,
          viewport,
        );
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            ),
        );
        const frame = await page
          .locator('[data-slot="app-frame"]')
          .boundingBox();
        assert(
          frame &&
            frame.y >= viewport.top &&
            frame.y + frame.height <= viewport.top + viewport.height + 1,
          `${width}px ${path}: frame outside ${JSON.stringify(viewport)}: ${JSON.stringify(frame)}`,
        );
        // On phones an open conversation replaces the app chrome with its own
        // header and back button, like a native messaging app.
        const fullScreenChat = path.startsWith("/messages") && width < 768;
        const controls = fullScreenChat
          ? [".dm-thread-header", ".dm-composer"]
          : [".app-header"];
        if (fullScreenChat)
          for (const selector of [".app-header", ".app-tabbar"])
            assert.equal(
              await page.locator(selector).isVisible(),
              false,
              `${width}px ${path}: ${selector} should give way to the chat`,
            );
        else if (width < 768) controls.push(".app-tabbar");
        if (path.startsWith("/messages") && !fullScreenChat)
          controls.push(".dm-composer");
        for (const selector of controls) {
          const box = await page.locator(selector).boundingBox();
          assert(
            box &&
              box.y >= viewport.top &&
              box.y + box.height <= viewport.top + viewport.height + 1,
            `${width}px ${path}: ${selector} hidden: ${JSON.stringify(box)}`,
          );
        }
        await page.locator('[data-slot="app-scroll"]').evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        assert.equal(
          await page.locator('[data-slot="app-frame"]').evaluate((node) => {
            node.scrollTop = 100;
            return node.scrollTop;
          }),
          0,
          "Only page content should scroll, never the shell",
        );
      }
      // Zoom must not relayout the whole app into the magnified viewport.
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent("test:viewport", {
            detail: { height: 422, top: 120, scale: 2 },
          }),
        ),
      );
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      assert.equal(
        await page.evaluate(() =>
          document.documentElement.style.getPropertyValue(
            "--visual-viewport-height",
          ),
        ),
        "844px",
      );
      await page.close();
    }
    console.log(
      `Main navigation and chat stay in view at ${width}px through keyboard, chrome, scrolling, and zoom changes.`,
    );
  }
  const navigation = await context.newPage();
  navigation.on("pageerror", (error) => errors.push(error.message));
  await navigation.goto("http://localhost:3317/feed");
  await navigation
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Today", exact: true })
    .click();
  await navigation.waitForURL("http://localhost:3317/");
  await navigation.locator('.app-shell[data-page="today"] #main h1').waitFor();
  await navigation.screenshot({
    path: "/private/tmp/pb-mobile-navigation.png",
  });
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
