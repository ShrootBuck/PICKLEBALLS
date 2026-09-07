import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { RefreshScheduler } from "../../lib/refresh-scheduler";

describe("refresh coordination", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("coalesces a burst and follows up once for changes during a refresh", () => {
    let calls = 0;
    const queue = new RefreshScheduler(() => calls++);
    queue.request();
    queue.request();
    jest.advanceTimersByTime(150);
    expect(calls).toBe(1);
    queue.request();
    queue.request();
    jest.advanceTimersByTime(1000);
    expect(calls).toBe(1);
    queue.complete(true);
    jest.advanceTimersByTime(150);
    expect(calls).toBe(2);
    queue.complete(true);
    jest.advanceTimersByTime(60_000);
    expect(calls).toBe(2);
    queue.dispose();
  });

  test("holds queued changes while offline, hidden, or uploading", () => {
    let calls = 0;
    const queue = new RefreshScheduler(() => calls++);
    queue.request();
    queue.setBlocked(true);
    jest.advanceTimersByTime(60_000);
    expect(calls).toBe(0);
    queue.request();
    queue.setBlocked(false);
    jest.advanceTimersByTime(150);
    expect(calls).toBe(1);
    queue.complete(true);
    queue.dispose();
  });

  test("retries failed refreshes twice then waits for a new trigger", () => {
    let calls = 0;
    const queue = new RefreshScheduler(() => calls++);
    queue.request();
    jest.advanceTimersByTime(150);
    queue.complete(false);
    jest.advanceTimersByTime(2000);
    queue.complete(false);
    jest.advanceTimersByTime(4000);
    queue.complete(false);
    jest.advanceTimersByTime(60_000);
    expect(calls).toBe(3);
    queue.request();
    jest.advanceTimersByTime(150);
    expect(calls).toBe(4);
    queue.dispose();
  });

  test("unmount cancels a queued refresh", () => {
    let calls = 0;
    const queue = new RefreshScheduler(() => calls++);
    queue.request();
    queue.dispose();
    jest.advanceTimersByTime(1000);
    expect(calls).toBe(0);
  });
});
