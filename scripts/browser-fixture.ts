import { chromium, webkit } from "playwright";

const environmentFile = Bun.file("/private/tmp/pb-social-test-env.json");
if (!(await environmentFile.exists())) {
  throw new Error("Start bun run test:fixture before running browser checks.");
}
export const fixtureEnvironment: Record<string, string> =
  await environmentFile.json();
if (
  fixtureEnvironment.PB_TEST_DATABASE !== "disposable-docker" ||
  new URL(fixtureEnvironment.DATABASE_URL).hostname !== "127.0.0.1"
) {
  throw new Error(
    "Start bun run test:fixture. Browser checks need disposable accounts.",
  );
}

export function launchFixtureBrowser() {
  return (process.argv.includes("--webkit") ? webkit : chromium).launch({
    headless: true,
  });
}
