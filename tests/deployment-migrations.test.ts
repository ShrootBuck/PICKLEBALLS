import { expect, test } from "bun:test";
import { pendingMigrations } from "../scripts/wait-for-database-migrations";

test("workers wait for the new migration during a concurrent app deployment", () => {
  expect(pendingMigrations(["initial", "adaptive_video"], ["initial"])).toEqual(
    ["adaptive_video"],
  );
});

test("an already migrated database also permits older worker deployments", () => {
  expect(pendingMigrations(["initial"], ["initial", "adaptive_video"])).toEqual(
    [],
  );
});
