import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fingerprint, validate } from "../deploy/cached-checks.mjs";

test("validation receipts require matching source and toolchain and never cache failure", () => {
  const temp = mkdtempSync(join(tmpdir(), "pb-check-cache-"));
  const root = join(temp, "source");
  const cache = join(temp, "cache");
  mkdirSync(root);
  mkdirSync(cache);
  writeFileSync(join(root, "source.ts"), "original");
  let runs = 0;
  let fail = false;
  const options = {
    root,
    cache,
    toolchain: { node: "24" },
    check() {
      runs++;
      if (fail) throw new Error("failed check");
    },
  };
  try {
    validate(options);
    validate(options);
    expect(runs).toBe(1);
    const initial = fingerprint(root, options.toolchain);
    writeFileSync(join(root, "source.ts"), "changed");
    fail = true;
    expect(() => validate(options)).toThrow("failed check");
    fail = false;
    validate(options);
    expect(runs).toBe(3);
    validate({ ...options, toolchain: { node: "25" } });
    expect(runs).toBe(4);
    rmSync(join(root, "source.ts"));
    expect(fingerprint(root, options.toolchain)).not.toBe(initial);
    validate(options);
    expect(runs).toBe(5);
  } finally {
    rmSync(temp, { recursive: true });
  }
});
