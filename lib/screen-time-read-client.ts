export type ScreenTimeReadResult =
  | { reading: { dailyAverageMinutes: number } }
  | { error: string };

// Keep one request in flight. Transient failures never discard the saved read.
export async function waitForScreenTimeRead(
  runId: string,
  signal: AbortSignal,
  onConnectionChange: (reconnecting: boolean) => void,
  interval = 2000,
): Promise<ScreenTimeReadResult> {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const response = await fetch(
        `/api/screen-time/read?runId=${encodeURIComponent(runId)}`,
        {
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        },
      );
      if (response.status >= 500 || response.status === 429) {
        throw new Error("Reader temporarily unavailable");
      }
      const result = await response.json();
      signal.throwIfAborted();
      failures = 0;
      onConnectionChange(false);
      if (!response.ok) {
        return {
          error: result.error ?? "Could not read this screenshot. Try again.",
        };
      }
      if (result.reading || result.error) return result;
      if (!result.pending) throw new Error("Invalid read response");
    } catch (error) {
      if (signal.aborted) throw error;
      failures += 1;
      onConnectionChange(true);
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(
        () => {
          signal.removeEventListener("abort", abort);
          resolve();
        },
        Math.min(interval * 2 ** Math.min(failures, 4), 30000),
      );
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  signal.throwIfAborted();
  throw new Error("Read stopped");
}
