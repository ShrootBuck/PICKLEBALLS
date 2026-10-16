"use client";

import type { DirectThread } from "@/lib/direct-message-types";
import {
  RealtimeConnection,
  type RealtimeStatus,
} from "@/lib/realtime-connection";
import type { RealtimeCommand } from "@/lib/realtime-protocol";
import type { RealtimeEvent } from "@/lib/realtime-types";

type ThreadWatch = {
  conversationId: string;
  revision: () => number | undefined;
  receive: (thread: DirectThread) => void;
  error: (message: string) => void;
};
const watches = new Map<string, ThreadWatch>();
let connection: RealtimeConnection | null = null;

function requestThread(subscriptionId: string, watch: ThreadWatch) {
  return (
    connection?.send({
      type: "watch-thread",
      subscriptionId,
      conversationId: watch.conversationId,
      sinceRevision: watch.revision(),
    }) ?? false
  );
}

export function openRealtime(
  url: string,
  onStatus: (status: RealtimeStatus) => void,
  verifySession: () => void,
) {
  const current = new RealtimeConnection(
    url,
    (frame) => {
      if (frame.type === "thread")
        watches.get(frame.subscriptionId)?.receive(frame.thread);
      else if (frame.type === "error") {
        if (frame.subscriptionId)
          watches.get(frame.subscriptionId)?.error(frame.error);
      } else if (frame.type !== "result") {
        if (frame.type === "ready")
          for (const [id, watch] of watches) requestThread(id, watch);
        dispatchRealtime(frame);
      }
    },
    onStatus,
    verifySession,
  );
  connection = current;
  return {
    setActive: (active: boolean, online: boolean) =>
      current.setActive(active, online),
    dispose() {
      current.dispose();
      if (connection === current) connection = null;
    },
  };
}

export function subscribeRealtimeThread(watch: ThreadWatch) {
  const id = crypto.randomUUID();
  watches.set(id, watch);
  requestThread(id, watch);
  return {
    request: () => requestThread(id, watch),
    dispose() {
      watches.delete(id);
      connection?.send({ type: "unwatch-thread", subscriptionId: id });
    },
  };
}

export const realtimeIsLive = () => connection?.live ?? false;
export const sendRealtime = (command: RealtimeCommand) =>
  connection?.send(command) ?? false;
export const acknowledgeRealtimeRead = (
  conversationId: string,
  through: number,
  signal?: AbortSignal,
) => connection?.acknowledgeRead(conversationId, through, signal) ?? null;

const eventName = "pb:realtime";
export function dispatchRealtime(event: RealtimeEvent) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: event }));
}
export function subscribeRealtime(listener: (event: RealtimeEvent) => void) {
  const receive = (event: Event) =>
    listener((event as CustomEvent<RealtimeEvent>).detail);
  window.addEventListener(eventName, receive);
  return () => window.removeEventListener(eventName, receive);
}
