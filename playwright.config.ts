import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const parsedTestDatabaseUrl = testDatabaseUrl ? new URL(testDatabaseUrl) : null;
if (
  !parsedTestDatabaseUrl ||
  !/test/i.test(parsedTestDatabaseUrl.pathname) ||
  parsedTestDatabaseUrl.port === "51218"
) {
  throw new Error(
    "TEST_DATABASE_URL must point to the dedicated test instance, never the dev instance.",
  );
}

const testAuthSecret =
  process.env.TEST_BETTER_AUTH_SECRET ??
  "pickle-balls-browser-test-secret-that-is-at-least-32-characters";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  globalSetup: "./tests/browser/global-setup.ts",
  webServer: {
    command: "bun run dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/sign-in",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_SECRET: testAuthSecret,
      BETTER_AUTH_URL: "http://127.0.0.1:3100",
      NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
      BOOTSTRAP_DISCORD_USER_ID: "browser-owner-discord-id",
      DISCORD_CLIENT_ID: "browser-test-client",
      DISCORD_CLIENT_SECRET: "browser-test-secret",
      CRON_SECRET: "browser-cron-secret",
    },
  },
});
