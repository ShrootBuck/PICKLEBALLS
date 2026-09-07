// One refresh at a time. Changes arriving during a request get a follow-up.
export class RefreshScheduler {
  private dirty = false;
  private blocked = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  running = false;

  constructor(private refresh: () => void) {}

  request() {
    this.dirty = true;
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
    this.running = false;
    if (!succeeded && this.retries < 2) {
      this.retries += 1;
      this.dirty = true;
    }
    this.schedule(succeeded ? 150 : 1000 * 2 ** this.retries);
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.dirty = false;
  }

  private schedule(delay = 150) {
    if (!this.dirty || this.blocked || this.running || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.dirty = false;
      this.running = true;
      this.refresh();
    }, delay);
  }
}
