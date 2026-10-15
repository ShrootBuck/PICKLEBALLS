import { expect, test } from "bun:test";
import { LiveRefresh } from "@/lib/live-refresh";

test("a burst is coalesced and a change arriving during a read gets a second read", async () => {
  let reads = 0;
  let finish = () => {};
  const queue = new LiveRefresh(async () => {
    reads++;
    if (reads === 1)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  });
  for (let i = 0; i < 20; i++) queue.request();
  await Bun.sleep(70);
  expect(reads).toBe(1);
  queue.request();
  queue.request();
  finish();
  await Bun.sleep(70);
  expect(reads).toBe(2);
  await Bun.sleep(80);
  expect(reads).toBe(2);
  queue.dispose();
});

test("hidden/offline work stays dirty until wakeup, and disposing cancels queued reads", async () => {
  let visible = false;
  let reads = 0;
  const queue = new LiveRefresh(
    async () => {
      reads++;
    },
    () => visible,
  );
  queue.request();
  await Bun.sleep(70);
  expect(reads).toBe(0);
  visible = true;
  queue.request();
  await Bun.sleep(70);
  expect(reads).toBe(1);
  queue.request();
  queue.dispose();
  await Bun.sleep(70);
  expect(reads).toBe(1);
});

test("a transient read failure retries without needing another event", async () => {
  let reads = 0;
  const queue = new LiveRefresh(async () => {
    if (++reads === 1) throw new Error("temporary network failure");
  });
  queue.request();
  await Bun.sleep(2200);
  expect(reads).toBe(2);
  queue.dispose();
});
