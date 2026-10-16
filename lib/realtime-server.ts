import "server-only";

import { Client } from "pg";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";
import {
  type RealtimeEnvelope,
  type RealtimeEvent,
  realtimeChannel,
  realtimeEnvelopeSchema,
} from "@/lib/realtime-types";

type Listener = (event: RealtimeEvent) => void;

// One dedicated LISTEN connection per web process, shared by all open sockets.
// Publishers (including the worker) use transactional Postgres notifications.
export class RealtimeHub {
  private listeners = new Map<string, Set<Listener>>();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private ready = false;
  private pending = new Map<string, RealtimeEnvelope>();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  subscribe(userId: string, listener: Listener) {
    const listeners = this.listeners.get(userId) ?? new Set<Listener>();
    if (listeners.size >= 12)
      throw new DomainError(
        "Too many live connections. Close an unused tab.",
        429,
      );
    listeners.add(listener);
    this.listeners.set(userId, listeners);
    if (this.ready) listener({ type: "ready" });
    else void this.connect();
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(userId);
    };
  }

  private async connect() {
    if (this.connecting) return this.connecting;
    const client = new Client({
      connectionString:
        process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
      application_name: "pickleballs-realtime",
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    });
    this.client = client;
    const disconnected = () => {
      if (this.client !== client) return;
      this.client = null;
      this.ready = false;
      this.connecting = null;
      clearTimeout(this.flushTimer);
      clearInterval(this.heartbeat);
      this.flushTimer = undefined;
      this.pending.clear();
      // Reopening the socket rechecks auth and refreshes snapshots. NOTIFY
      // is deliberately not an event log; missed changes are read from the DB.
      this.broadcast({ type: "reconnect" });
      void client.end().catch(() => {});
    };
    client.on("error", disconnected);
    client.on("end", disconnected);
    client.on("notification", ({ channel, payload }) => {
      if (channel !== realtimeChannel || !payload) return;
      try {
        const parsed = realtimeEnvelopeSchema.safeParse(JSON.parse(payload));
        if (!parsed.success) return;
        const envelope = parsed.data;
        if (
          envelope.event.type === "typing" ||
          envelope.event.type === "session"
        ) {
          void this.deliver(envelope).catch(disconnected);
          return;
        }
        // Collapse transaction fan-out and worker progress bursts, without
        // dropping a second change that arrives while an audience lookup runs.
        this.pending.set(JSON.stringify(envelope), envelope);
        if (!this.flushTimer) {
          this.flushTimer = setTimeout(() => {
            this.flushTimer = undefined;
            const batch = [...this.pending.values()];
            this.pending.clear();
            void Promise.all(batch.map((event) => this.deliver(event))).catch(
              disconnected,
            );
          }, 40);
        }
      } catch {
        // Ignore malformed notifications; no untrusted payload reaches clients.
      }
    });
    this.connecting = (async () => {
      try {
        await client.connect();
        await client.query(`LISTEN ${realtimeChannel}`);
        if (this.client !== client) return;
        this.ready = true;
        // Browser heartbeats alone cannot detect a half-open DB socket.
        this.heartbeat = setInterval(() => {
          void client.query("SELECT 1").catch(disconnected);
        }, 20_000);
        this.broadcast({ type: "ready" });
      } catch {
        console.warn(
          "Realtime database listener disconnected; clients will reconnect.",
        );
        disconnected();
      } finally {
        if (this.client === client) this.connecting = null;
      }
    })();
    return this.connecting;
  }

  private broadcast(event: RealtimeEvent) {
    for (const listeners of [...this.listeners.values()])
      for (const listener of [...listeners]) listener(event);
  }

  private async deliver(envelope: RealtimeEnvelope) {
    if (envelope.scope === "user") {
      for (const listener of [...(this.listeners.get(envelope.id) ?? [])])
        listener(envelope.event);
      return;
    }
    if (!this.listeners.size) return;
    // Check current membership for every batch, never trust a connection-time
    // snapshot after someone leaves or is removed from a circle.
    const members = await getPrisma().membership.findMany({
      where: {
        circleId: envelope.id,
        userId: { in: [...this.listeners.keys()] },
      },
      select: { userId: true },
    });
    for (const { userId } of members)
      for (const listener of [...(this.listeners.get(userId) ?? [])])
        listener(
          envelope.event.type === "refresh"
            ? { type: "refresh", circleId: envelope.id }
            : envelope.event,
        );
  }

  async close() {
    const client = this.client;
    this.client = null;
    this.ready = false;
    this.connecting = null;
    clearTimeout(this.flushTimer);
    clearInterval(this.heartbeat);
    this.flushTimer = undefined;
    this.pending.clear();
    this.broadcast({ type: "reconnect" });
    if (client) await client.end().catch(() => {});
  }
}

const globals = globalThis as typeof globalThis & {
  pickleBallsRealtime?: RealtimeHub;
};
export function getRealtimeHub() {
  globals.pickleBallsRealtime ??= new RealtimeHub();
  return globals.pickleBallsRealtime;
}

export async function publishRealtime(envelope: RealtimeEnvelope) {
  await getPrisma()
    .$executeRaw`SELECT pg_notify(${realtimeChannel}, ${JSON.stringify(envelope)})`;
}
