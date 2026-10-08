/** Isolate module mocks per file; filesystem traversal order differs by OS. */
import { availableParallelism } from "node:os";

const files = [...new Bun.Glob("tests/**/*.test.ts").scanSync()].sort();
let next = 0;
let failed = 0;
await Promise.all(
  Array.from(
    { length: Math.min(availableParallelism(), files.length) },
    async () => {
      while (next < files.length) {
        const file = files[next++];
        const child = Bun.spawn(
          [process.execPath, "test", file, "--timeout", "30000"],
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
console.log(`${files.length - failed}/${files.length} unit test files passed.`);
process.exitCode = failed ? 1 : 0;
