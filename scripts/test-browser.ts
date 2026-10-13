export {};

const suites = [...new Bun.Glob("scripts/test-*-browser.ts").scanSync()]
  .map((file) => file.replace("scripts/test-", "").replace("-browser.ts", ""))
  .sort();
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Start bun run test:fixture first (add --video for media).
Usage: bun run test:browser [suite] [--webkit]
Suites: ${suites.join(", ")}
Default: app-layout`);
} else {
  const names = args.filter((arg) => !arg.startsWith("--"));
  const suite = names[0] ?? "app-layout";
  if (
    names.length > 1 ||
    !suites.includes(suite) ||
    args.some((arg) => arg.startsWith("--") && arg !== "--webkit")
  ) {
    throw new Error(
      `Choose one browser suite: ${suites.join(", ")}. Optional: --webkit.`,
    );
  }
  const child = Bun.spawn(
    [
      process.execPath,
      `scripts/test-${suite}-browser.ts`,
      ...args.filter((arg) => arg === "--webkit"),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  process.exitCode = await child.exited;
}
