import {
  type RealtimeCommand,
  type RealtimeFrame,
  realtimeFrameSchema,
} from "@/lib/realtime-protocol";

export type RealtimeStatus =
  | "connecting"
  | "live"
  | "reconnecting"
  | "offline"
  | "paused";
export class RealtimeUnavailable extends Error {
  constructor() {
    super("The live connection was interrupted.");
  }
}
export class RealtimeRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** One connection, bounded work, and an explicit resync on every new session. */
export class RealtimeConnection {
  private socket: WebSocket | null = null;
  private active = false;
  private disposed = false;
  private signedOut = false;
  private attempts = 0;
  private lastFrame = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setInterval>;
  private pending = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  live = false;

  constructor(
    private url: string,
    private onFrame: (frame: RealtimeFrame) => void,
    private onStatus: (status: RealtimeStatus) => void,
    private verifySession: () => void = () => {},
  ) {
    this.watchdog = setInterval(() => {
      if (this.socket && Date.now() - this.lastFrame > 45_000) this.reconnect();
    }, 10_000);
  }

  setActive(active: boolean, online = true) {
    this.active = active && online;
    if (!this.active) {
      this.disconnect();
      this.onStatus(online ? "paused" : "offline");
    } else if (!this.socket && !this.retry) this.connect();
  }

  send(command: RealtimeCommand) {
    if (!this.live || this.socket?.readyState !== WebSocket.OPEN) return false;
    if (this.socket.bufferedAmount > 64 * 1024) {
      this.reconnect();
      return false;
    }
    try {
      this.socket.send(JSON.stringify(command));
      return true;
    } catch {
      this.reconnect();
      return false;
    }
  }

  acknowledgeRead(
    conversationId: string,
    through: number,
    signal?: AbortSignal,
  ): Promise<void> | null {
    if (!this.live || this.pending.size >= 32) return null;
    if (signal?.aborted) return Promise.reject(signal.reason);
    const requestId = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(requestId);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(signal?.reason ?? new RealtimeUnavailable());
      const timeout = setTimeout(() => {
        finish(new RealtimeUnavailable());
        this.reconnect();
      }, 10_000);
      this.pending.set(requestId, { resolve: () => finish(), reject: finish });
      signal?.addEventListener("abort", abort, { once: true });
      if (!this.send({ type: "read", requestId, conversationId, through }))
        finish(new RealtimeUnavailable());
    });
  }

  private connect() {
    if (!this.active || this.disposed || this.signedOut) return;
    this.onStatus(this.attempts ? "reconnecting" : "connecting");
    this.lastFrame = Date.now();
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    let wasReady = false;
    socket.onmessage = (message) => {
      if (this.socket !== socket) return;
      let frame: RealtimeFrame;
      try {
        const parsed = realtimeFrameSchema.safeParse(JSON.parse(message.data));
        if (!parsed.success) return;
        frame = parsed.data;
      } catch {
        return;
      }
      this.lastFrame = Date.now();
      if (frame.type === "signed-out") {
        this.signedOut = true;
        this.disconnect();
        this.onFrame(frame);
      } else if (frame.type === "reconnect") {
        this.reconnect();
      } else if (frame.type === "ready") {
        this.live = true;
        wasReady = true;
        this.attempts = 0;
        this.onStatus("live");
        this.onFrame(frame);
      } else if (frame.type === "result") {
        this.pending.get(frame.requestId)?.resolve();
      } else if (frame.type === "error" && frame.requestId) {
        this.pending
          .get(frame.requestId)
          ?.reject(new RealtimeRequestError(frame.error, frame.status));
      } else if (frame.type !== "ping") this.onFrame(frame);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      if (event.code === 4001) {
        this.signedOut = true;
        this.disconnect();
        this.onFrame({ type: "signed-out" });
        return;
      }
      if (!wasReady) this.verifySession();
      this.reconnect();
    };
    // Browsers follow an error with close. The watchdog covers silent stalls.
    socket.onerror = () => {};
  }

  private disconnect() {
    clearTimeout(this.retry);
    this.retry = undefined;
    const socket = this.socket;
    this.socket = null;
    this.live = false;
    socket?.close();
    for (const pending of this.pending.values())
      pending.reject(new RealtimeUnavailable());
    this.pending.clear();
  }

  private reconnect() {
    this.disconnect();
    if (!this.active || this.disposed || this.signedOut) return;
    this.onFrame({ type: "reconnect" });
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (!this.active || this.disposed || this.signedOut) return;
    this.onStatus("reconnecting");
    const delay = Math.min(20_000, 500 * 2 ** Math.min(this.attempts++, 6));
    this.retry = setTimeout(
      () => {
        this.retry = undefined;
        this.connect();
      },
      delay * (0.75 + Math.random() * 0.5),
    );
  }

  dispose() {
    this.disposed = true;
    this.disconnect();
    clearInterval(this.watchdog);
  }
}
