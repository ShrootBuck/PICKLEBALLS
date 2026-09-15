import { activeMutations, refreshBusyEvent } from "@/lib/app-refresh";

// One request at a time, with no work while the app is hidden or offline.
export function startLivePoll(
  read: (signal: AbortSignal) => Promise<void>,
  interval: number,
) {
  let stopped = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const available = () =>
    document.visibilityState !== "hidden" &&
    navigator.onLine &&
    activeMutations() === 0;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && available()) timer = setTimeout(run, interval);
  };
  async function run() {
    clearTimeout(timer);
    if (stopped || controller || !available()) return;
    controller = new AbortController();
    try {
      await read(controller.signal);
    } catch {
      // Keep the last successful data; the next check retries.
    } finally {
      controller = undefined;
      schedule();
    }
  }
  function resume() {
    if (!available()) {
      clearTimeout(timer);
      controller?.abort();
    } else {
      void run();
    }
  }
  document.addEventListener("visibilitychange", resume);
  for (const event of [
    "online",
    "offline",
    "pageshow",
    "pb:push-received",
    refreshBusyEvent,
  ])
    window.addEventListener(event, resume);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", resume);
    for (const event of [
      "online",
      "offline",
      "pageshow",
      "pb:push-received",
      refreshBusyEvent,
    ])
      window.removeEventListener(event, resume);
  };
}
