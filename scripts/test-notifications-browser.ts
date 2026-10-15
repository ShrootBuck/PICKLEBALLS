// Browser permission/subscription APIs are simulated; no real pushes are sent.
import assert from "node:assert/strict";
import { launchFixtureBrowser } from "./browser-fixture";

const browser = await launchFixtureBrowser();
try {
  for (const ios of [true, false]) {
    const context = await browser.newContext({
      viewport: { width: 320, height: 740 },
      serviceWorkers: "block",
      ...(ios
        ? {
            userAgent:
              "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
          }
        : {}),
    });
    await context.addInitScript((ios) => {
      let requested = 0;
      let subscribed = false;
      const subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        toJSON: () => ({
          endpoint: subscription.endpoint,
          keys: { p256dh: "test", auth: "test" },
        }),
        unsubscribe: async () => {
          subscribed = false;
          return true;
        },
      };
      const registration = {
        pushManager: {
          getSubscription: async () => (subscribed ? subscription : null),
          subscribe: async () => {
            subscribed = true;
            return subscription;
          },
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          register: async () => registration,
          ready: Promise.resolve(registration),
          getRegistration: async () => registration,
          addEventListener() {},
          removeEventListener() {},
        },
      });
      if (ios) {
        // iOS browser tabs don't expose push, but must still show install steps.
        Reflect.deleteProperty(window, "Notification");
        Reflect.deleteProperty(window, "PushManager");
      } else {
        Object.defineProperty(window, "PushManager", {
          value: function PushManager() {},
        });
        Object.defineProperty(window, "Notification", {
          value: {
            permission: "default",
            requestPermission: async () => {
              requested++;
              return "granted";
            },
          },
        });
      }
      Object.defineProperty(window, "testPermissionRequests", {
        get: () => requested,
      });
    }, ios);
    let page = await context.newPage();
    let configured = false;
    let saved = false;
    await context.route("**/api/push/public-key", (route) =>
      route.fulfill({
        status: configured ? 200 : 503,
        json: configured
          ? { publicKey: "B".repeat(87) }
          : { error: "Push not configured." },
      }),
    );
    await context.route("**/api/push/subscriptions**", (route) => {
      const method = route.request().method();
      if (method === "POST") saved = true;
      if (method === "DELETE") saved = false;
      return route.fulfill({ json: { subscribed: saved } });
    });
    await page.goto("http://localhost:3318/login");
    await page.locator(".app-shell").waitFor();
    await page.close();
    page = await context.newPage();
    await page.goto("http://localhost:3317/settings");
    const settings = page.locator("#main").getByRole("region", {
      name: "Notifications",
      exact: true,
    });
    if (ios) {
      await settings
        .getByText("Enable notifications on iPhone or iPad", { exact: true })
        .waitFor();
      assert.equal(await settings.locator("li").count(), 3);
      assert.equal(
        await settings
          .getByRole("button", { name: "Enable notifications", exact: true })
          .count(),
        0,
      );
      console.log(
        "iPhone browser tabs show Home Screen setup even without push APIs.",
      );
    } else {
      const enable = settings.getByRole("button", {
        name: "Enable notifications",
        exact: true,
      });
      await enable.waitFor();
      assert.equal(
        await page.evaluate(() =>
          Reflect.get(window, "testPermissionRequests"),
        ),
        0,
      );
      await enable.click();
      await settings
        .getByRole("alert")
        .filter({ hasText: "aren't configured on the server" })
        .waitFor();
      assert.equal(saved, false);
      configured = true;
      await enable.click();
      await settings
        .getByRole("button", { name: "Turn off", exact: true })
        .waitFor();
      assert.equal(saved, true);
      await settings
        .getByRole("button", { name: "Turn off", exact: true })
        .click();
      await enable.waitFor();
      assert.equal(saved, false);
      console.log(
        "Notifications require a tap, report missing server configuration, and enable/disable successfully.",
      );
      for (const name of ["Direct messages", "Group messages"]) {
        const control = settings.getByRole("checkbox", { name, exact: true });
        await control.waitFor();
        assert.equal(await control.getAttribute("aria-checked"), "true");
        const savedPreference = page.waitForResponse(
          (response) =>
            response.url().endsWith("/api/notifications/preferences") &&
            response.request().method() === "PUT",
        );
        await control.click();
        assert.equal((await savedPreference).status(), 200);
        await page.reload();
        await control.waitFor();
        assert.equal(await control.getAttribute("aria-checked"), "false");
      }
      const restore = await page.evaluate(async () => {
        const url = "/api/notifications/preferences";
        const { preferences } = await (await fetch(url)).json();
        const response = await fetch(url, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...preferences,
            directMessages: true,
            groupMessages: true,
          }),
        });
        return response.status;
      });
      assert.equal(restore, 200);
      await page.reload();
      await settings
        .getByRole("checkbox", { name: "Direct messages", exact: true })
        .waitFor();
      assert.equal(
        await settings
          .getByRole("checkbox", { name: "Direct messages", exact: true })
          .getAttribute("aria-checked"),
        "true",
      );
      assert.equal(
        await settings
          .getByRole("checkbox", { name: "Group messages", exact: true })
          .getAttribute("aria-checked"),
        "true",
      );
      console.log(
        "DM and group notification preferences persist independently after reload.",
      );
    }
    const sizes = await settings.evaluate((node) => ({
      width: node.clientWidth,
      content: node.scrollWidth,
    }));
    assert(
      sizes.content <= sizes.width + 1,
      "Notification controls must fit a narrow phone",
    );
    await settings.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/private/tmp/pb-notifications-${ios ? "iphone" : "browser"}.png`,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
