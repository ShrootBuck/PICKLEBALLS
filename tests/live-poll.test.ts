import { afterEach, beforeEach, expect, test } from "bun:test";
import { holdAppRefresh } from "@/lib/app-refresh";
import { startLivePoll } from "@/lib/live-poll";

let page: EventTarget & { visibilityState: string };
let browser: EventTarget;
let connection: { onLine: boolean };
let stop: (() => void) | undefined;
const saved = new Map<string, PropertyDescriptor | undefined>();
beforeEach(() => {
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  browser = new EventTarget();
  connection = { onLine: true };
  for (const [key, value] of Object.entries({
    document: page,
    window: browser,
    navigator: connection,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
});
afterEach(() => {
  stop?.();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test("live reads never overlap and abort on hide, writes, and disposal", async () => {
  const signals: AbortSignal[] = [];
  const finishes: (() => void)[] = [];
  stop = startLivePoll((signal) => {
    signals.push(signal);
    return new Promise<void>((resolve) => finishes.push(resolve));
  }, 60_000);
  browser.dispatchEvent(new Event("online"));
  browser.dispatchEvent(new Event("pb:push-received"));
  expect(signals).toHaveLength(1);
  page.visibilityState = "hidden";
  page.dispatchEvent(new Event("visibilitychange"));
  expect(signals[0].aborted).toBe(true);
  finishes[0]();
  await settle();
  page.visibilityState = "visible";
  page.dispatchEvent(new Event("visibilitychange"));
  expect(signals).toHaveLength(2);
  const release = holdAppRefresh();
  expect(signals[1].aborted).toBe(true);
  finishes[1]();
  await settle();
  browser.dispatchEvent(new Event("online"));
  expect(signals).toHaveLength(2);
  release();
  expect(signals).toHaveLength(3);
  stop();
  expect(signals[2].aborted).toBe(true);
  finishes[2]();
  await settle();
  browser.dispatchEvent(new Event("online"));
  expect(signals).toHaveLength(3);
});

test("offline checks pause and reconnect retries a failed read", async () => {
  let reads = 0;
  connection.onLine = false;
  stop = startLivePoll(async () => {
    reads++;
    throw new Error("offline");
  }, 60_000);
  browser.dispatchEvent(new Event("pageshow"));
  expect(reads).toBe(0);
  connection.onLine = true;
  browser.dispatchEvent(new Event("online"));
  await settle();
  expect(reads).toBe(1);
  browser.dispatchEvent(new Event("pb:push-received"));
  await settle();
  expect(reads).toBe(2);
});

test("periodic checks continue after a network failure", async () => {
  let reads = 0;
  let done!: () => void;
  const completed = new Promise<void>((resolve) => {
    done = resolve;
  });
  stop = startLivePoll(async () => {
    reads++;
    if (reads === 1) throw new Error("temporary");
    stop?.();
    done();
  }, 5);
  await completed;
  expect(reads).toBe(2);
});
