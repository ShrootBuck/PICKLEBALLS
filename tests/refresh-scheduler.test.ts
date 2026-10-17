import { afterEach, expect, jest, test } from "bun:test";
import { RefreshScheduler } from "@/lib/refresh-scheduler";

afterEach(() => jest.useRealTimers());

test("route reads keep retrying through a prolonged outage, then become idle", () => {
  jest.useFakeTimers();
  let reads = 0;
  const queue = new RefreshScheduler(() => reads++);
  queue.request();
  jest.advanceTimersByTime(150);
  expect(reads).toBe(1);
  for (const delay of [2000, 4000, 8000, 16000, 30000, 30000]) {
    queue.complete(false);
    jest.advanceTimersByTime(delay - 1);
    const before = reads;
    jest.advanceTimersByTime(1);
    expect(reads).toBe(before + 1);
  }
  queue.complete(true);
  jest.advanceTimersByTime(60_000);
  expect(reads).toBe(7);
  queue.dispose();
});

test("blocked and in-flight changes are retained, and a new event expedites recovery", () => {
  jest.useFakeTimers();
  let reads = 0;
  const queue = new RefreshScheduler(() => reads++);
  queue.setBlocked(true);
  queue.request();
  jest.advanceTimersByTime(1000);
  expect(reads).toBe(0);
  queue.setBlocked(false);
  jest.advanceTimersByTime(150);
  for (let i = 0; i < 10; i++) queue.request();
  jest.advanceTimersByTime(1000);
  expect(reads).toBe(1);
  queue.complete(true);
  jest.advanceTimersByTime(150);
  expect(reads).toBe(2);
  queue.complete(false);
  queue.request();
  jest.advanceTimersByTime(150);
  expect(reads).toBe(3);
  queue.dispose();
  queue.complete(false);
  queue.request();
  queue.setBlocked(false);
  jest.advanceTimersByTime(60_000);
  expect(reads).toBe(3);
});
