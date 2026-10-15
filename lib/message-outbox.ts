import type { DirectMessageItem } from "@/lib/direct-message-types";

export type MessageDraft = { body: string; files: File[] };
export type OutgoingMessage = MessageDraft & {
  clientId: string;
  conversationId: string;
  createdAt: string;
  state: "queued" | "sending" | "failed" | "sent";
  status: string;
  percent: number | null;
  mediaIds?: string[];
  message?: DirectMessageItem;
};
export type MessageSnapshot = {
  ready: boolean;
  drafts: Record<string, MessageDraft>;
  outbox: OutgoingMessage[];
};
type Delivery = (
  message: OutgoingMessage,
  progress: (status: string, percent?: number) => void,
  uploaded: (mediaIds: string[]) => void,
  signal: AbortSignal,
) => Promise<DirectMessageItem>;

const serverSnapshot: MessageSnapshot = {
  ready: false,
  drafts: {},
  outbox: [],
};

/** One ordered queue per conversation. Drafts never double as in-flight sends. */
export class MessageOutbox {
  private snapshot: MessageSnapshot = serverSnapshot;
  private listeners = new Set<() => void>();
  private running = new Set<string>();
  private attempts = new Map<
    string,
    { clientId: string; controller: AbortController }
  >();
  private controller: AbortController | null = null;

  constructor(
    private deliver: Delivery,
    private persist: (snapshot: MessageSnapshot) => void,
    private changed: () => void,
  ) {}

  getSnapshot = () => this.snapshot;
  // Suspense children may hydrate after the provider has restored browser state.
  getServerSnapshot = () => serverSnapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  restore(snapshot?: Pick<MessageSnapshot, "drafts" | "outbox">) {
    if (this.snapshot.ready) return;
    this.snapshot = {
      ready: true,
      drafts: snapshot?.drafts ?? {},
      outbox: snapshot?.outbox ?? [],
    };
    this.emit();
  }
  start() {
    this.controller = new AbortController();
    for (const item of this.snapshot.outbox)
      void this.flush(item.conversationId);
  }
  stop() {
    this.controller?.abort();
    this.controller = null;
  }
  private emit() {
    this.persist(this.snapshot);
    for (const listener of this.listeners) listener();
  }
  setDraft(id: string, draft: MessageDraft) {
    const drafts = { ...this.snapshot.drafts };
    if (draft.body || draft.files.length) drafts[id] = draft;
    else delete drafts[id];
    this.snapshot = { ...this.snapshot, drafts };
    this.emit();
  }
  enqueue(id: string) {
    const draft = this.snapshot.drafts[id];
    if (!draft || (!draft.body.trim() && !draft.files.length)) return;
    const item: OutgoingMessage = {
      ...draft,
      clientId: crypto.randomUUID(),
      conversationId: id,
      createdAt: new Date().toISOString(),
      state: "queued",
      status: "Queued",
      percent: null,
    };
    const drafts = { ...this.snapshot.drafts };
    delete drafts[id];
    this.snapshot = {
      ...this.snapshot,
      drafts,
      outbox: [...this.snapshot.outbox, item],
    };
    this.emit();
    void this.flush(id);
    return item.clientId;
  }
  private patch(clientId: string, patch: Partial<OutgoingMessage>) {
    this.snapshot = {
      ...this.snapshot,
      outbox: this.snapshot.outbox.map((item) =>
        item.clientId === clientId ? { ...item, ...patch } : item,
      ),
    };
    this.emit();
  }
  retry(clientId: string) {
    const item = this.snapshot.outbox.find((row) => row.clientId === clientId);
    if (item?.state !== "failed") return;
    this.patch(clientId, { state: "queued", status: "Queued", percent: null });
    void this.flush(item.conversationId);
  }
  dismiss(clientId: string) {
    const item = this.snapshot.outbox.find((row) => row.clientId === clientId);
    if (item?.state !== "failed") return;
    this.remove(new Set([clientId]));
    void this.flush(item.conversationId);
  }
  acknowledge(
    conversationId: string,
    messages: DirectMessageItem[],
    viewerId: string,
  ) {
    const ids = new Set(
      messages
        .filter((row) => row.senderId === viewerId)
        .map((row) => row.clientId),
    );
    const matched = this.snapshot.outbox.filter(
      (row) => row.conversationId === conversationId && ids.has(row.clientId),
    );
    if (!matched.length) return;
    this.remove(new Set(matched.map((row) => row.clientId)));
    // A confirmed delivery must not hold up the queue while its HTTP response
    // stalls. The database receipt is enough to safely advance to the next send.
    const attempt = this.attempts.get(conversationId);
    if (attempt && ids.has(attempt.clientId)) attempt.controller.abort();
    for (const row of matched) void this.flush(row.conversationId);
  }
  private remove(ids: Set<string>) {
    this.snapshot = {
      ...this.snapshot,
      outbox: this.snapshot.outbox.filter((row) => !ids.has(row.clientId)),
    };
    this.emit();
  }
  private async flush(id: string) {
    if (!this.controller || this.running.has(id)) return;
    const signal = this.controller.signal;
    this.running.add(id);
    try {
      while (!signal.aborted) {
        const item = this.snapshot.outbox.find(
          (row) => row.conversationId === id && row.state !== "sent",
        );
        if (!item || item.state === "failed") break;
        this.patch(item.clientId, {
          state: "sending",
          status: "Sending…",
          percent: null,
        });
        const controller = new AbortController();
        this.attempts.set(id, { clientId: item.clientId, controller });
        try {
          const message = await this.deliver(
            item,
            (status, percent) =>
              this.patch(item.clientId, { status, percent: percent ?? null }),
            (mediaIds) => this.patch(item.clientId, { mediaIds }),
            AbortSignal.any([signal, controller.signal]),
          );
          // Realtime may already have confirmed and removed this send.
          this.patch(item.clientId, {
            state: "sent",
            status: "Sent",
            message,
            files: [],
          });
          this.changed();
        } catch (cause) {
          this.patch(item.clientId, {
            state: "failed",
            percent: null,
            status: signal.aborted
              ? "Send interrupted. Retry to check delivery."
              : cause instanceof Error
                ? cause.message
                : "Couldn't send. Try again.",
          });
        } finally {
          this.attempts.delete(id);
        }
      }
    } finally {
      this.running.delete(id);
      // A provider can reconnect while an aborted attempt is still unwinding.
      if (signal.aborted && this.controller) void this.flush(id);
    }
  }
}
