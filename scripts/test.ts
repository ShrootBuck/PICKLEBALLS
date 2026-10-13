/** Isolate module mocks per file; filesystem traversal order differs by OS. */
import { availableParallelism } from "node:os";

const suites = {
  unit: "tests/**/*.test.ts",
  migrations: "tests/**/*.migration.ts",
  media: "tests/**/*.media.ts",
  all: "tests/**/*.{test,migration,media}.ts",
};
const suite = process.argv[2] ?? "unit";
if (!Object.hasOwn(suites, suite) || process.argv.length > 3) {
  throw new Error("Usage: bun scripts/test.ts [unit|migrations|media|all]");
}
const files = [
  ...new Bun.Glob(suites[suite as keyof typeof suites]).scanSync(),
].sort();
if (!files.length) throw new Error(`No ${suite} tests found.`);
let next = 0;
let failed = 0;
await Promise.all(
  Array.from(
    { length: Math.min(availableParallelism(), files.length) },
    async () => {
      while (next < files.length) {
        const file = files[next++];
        const child = Bun.spawn(
          [process.execPath, "test", `./${file}`, "--timeout", "30000"],
          {
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        console.log(`\n${file}\n${stdout}${stderr}`);
        if (code) failed++;
      }
    },
  ),
);
console.log(
  `${files.length - failed}/${files.length} ${suite} test files passed.`,
);
process.exitCode = failed ? 1 : 0;
