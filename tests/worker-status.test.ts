import { expect, test } from "bun:test";
import { jobIdForKey } from "../lib/queue";
import { localReadStatus } from "../lib/worker-status";

const run = {
  name: "read-screen-time",
  data: { userId: "u1", circleId: "c1", mediaId: "m1", week: "2026-09-20" },
  state: "completed" as const,
  output: { ok: false, message: "Choose another image" },
};
test("local run status never exposes another user's or circle's output", () => {
  expect(() => localReadStatus(run, "u2", "c1")).toThrow("unavailable");
  expect(() => localReadStatus(run, "u1", "c2")).toThrow("unavailable");
  expect(() =>
    localReadStatus({ ...run, name: "notification" }, "u1", "c1"),
  ).toThrow("unavailable");
  expect(() => localReadStatus(null, "u1", "c1")).toThrow("unavailable");
});
test("retrying reads remain pending and failed infrastructure errors stay private", () => {
  expect(localReadStatus({ ...run, state: "retry" }, "u1", "c1")).toEqual({
    pending: true,
  });
  expect(localReadStatus(run, "u1", "c1")).toEqual({
    error: "Choose another image",
  });
  expect(
    localReadStatus(
      { ...run, state: "failed", output: { secret: "provider response" } },
      "u1",
      "c1",
    ),
  ).toEqual({
    error: "The screenshot reader could not finish. Try uploading again.",
  });
});
test("dispatch IDs survive retries and distinguish explicit user retries", () => {
  const id = jobIdForKey("process-media", "encode:m1:0");
  expect(id).toBe(jobIdForKey("process-media", "encode:m1:0"));
  expect(id).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  expect(id).not.toBe(jobIdForKey("process-media", "encode:m1:1"));
  expect(id).not.toBe(jobIdForKey("notification", "encode:m1:0"));
});
