// One refresh at a time. Changes arriving during a request get a follow-up.
export class RefreshScheduler {
  private dirty = false;
  private blocked = false;
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  running = false;

  constructor(private refresh: () => void) {}

  request() {
    if (this.disposed) return;
    this.dirty = true;
    if (this.retries) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.retries = 0;
    this.schedule();
  }

  setBlocked(blocked: boolean) {
    this.blocked = blocked;
    if (blocked) {
      clearTimeout(this.timer);
      this.timer = undefined;
    } else {
      this.schedule();
    }
  }

  complete(succeeded: boolean) {
    if (this.disposed) return;
    this.running = false;
    if (succeeded) this.retries = 0;
    else {
      this.retries = Math.min(this.retries + 1, 5);
      this.dirty = true;
    }
    this.schedule(succeeded ? 150 : Math.min(30_000, 1000 * 2 ** this.retries));
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.dirty = false;
  }

  private schedule(delay = 150) {
    if (
      this.disposed ||
      !this.dirty ||
      this.blocked ||
      this.running ||
      this.timer
    )
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.dirty = false;
      this.running = true;
      this.refresh();
    }, delay);
  }
}
