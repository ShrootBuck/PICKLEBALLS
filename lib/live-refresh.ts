// Coalesce bursts, retain invalidations that arrive during a read, and retry
// failed reads. There is no periodic polling while the connection is healthy.
export class LiveRefresh {
  private dirty = false;
  private running = false;
  private disposed = false;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private read: () => Promise<void>,
    private canRead = () => true,
  ) {}

  request = () => {
    if (this.disposed) return;
    this.dirty = true;
    // A new change or a returning connection should not sit behind an old
    // failure's backoff. Timer-driven retries still back off on their own.
    if (this.retries) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.retries = 0;
    }
    this.schedule(40);
  };

  private schedule(delay: number) {
    if (
      this.disposed ||
      this.running ||
      this.timer ||
      !this.dirty ||
      !this.canRead()
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delay);
  }

  private async flush() {
    if (this.disposed || !this.canRead()) return;
    this.running = true;
    this.dirty = false;
    try {
      await this.read();
      this.retries = 0;
    } catch {
      this.dirty = true;
      this.retries += 1;
    } finally {
      this.running = false;
      this.schedule(
        this.retries
          ? Math.min(30_000, 1000 * 2 ** Math.min(this.retries, 5))
          : 40,
      );
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
