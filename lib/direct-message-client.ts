"use client";

import { useEffect, useState } from "react";
import type { DirectThread } from "@/lib/direct-message-types";
import { LiveRefresh } from "@/lib/live-refresh";
import {
  acknowledgeRealtimeRead,
  realtimeIsLive,
  subscribeRealtime,
  subscribeRealtimeThread,
} from "@/lib/realtime-client";
import { RealtimeUnavailable } from "@/lib/realtime-connection";
import { watchRealtime } from "@/lib/watch-realtime";

export const messagesChangedEvent = "pb:messages-changed";
export function messagesChanged() {
  window.dispatchEvent(new Event(messagesChangedEvent));
}

export async function messageRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  // Read acknowledgements are monotonic and safe to repeat if a socket dies
  // after committing but before its reply arrives. Durable sends retain their
  // existing HTTP idempotency and outbox recovery.
  const threadPath = /^\/api\/messages\/([^/?]+)$/.exec(url);
  if (
    method === "PATCH" &&
    threadPath &&
    typeof body === "object" &&
    body !== null &&
    "through" in body &&
    typeof body.through === "number"
  ) {
    const pending = acknowledgeRealtimeRead(
      decodeURIComponent(threadPath[1]),
      body.through,
      signal,
    );
    if (pending) {
      try {
        await pending;
        return { read: true } as T;
      } catch (error) {
        if (!(error instanceof RealtimeUnavailable) || signal?.aborted)
          throw error;
      }
    }
  }
  const response = await fetch(url, {
    method,
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
    ...(body !== undefined
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  }).catch((cause: unknown) => {
    if (signal?.aborted) throw cause;
    throw new Error(
      cause instanceof Error && cause.name === "TimeoutError"
        ? "The request timed out. Try again."
        : "Couldn't connect. Check your connection and try again.",
    );
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.error ?? "Couldn't reach messages. Try again.");
  if (data === null) throw new Error("Couldn't read the response. Try again.");
  return data;
}

/** Push the open thread over the shared socket; HTTP only recovers while disconnected. */
export function watchDirectThread(options: {
  conversationId: string;
  revision: () => number | undefined;
  receive: (thread: DirectThread) => void;
  read: () => Promise<void>;
  error: (message: string) => void;
}) {
  const visible = () =>
    document.visibilityState !== "hidden" && navigator.onLine;
  const subscription = subscribeRealtimeThread(options);
  const fallback = new LiveRefresh(
    options.read,
    () => visible() && !realtimeIsLive(),
  );
  const request = () => {
    if (!visible()) return;
    if (!subscription.request()) fallback.request();
  };
  const localChange = () => {
    if (!realtimeIsLive()) fallback.request();
  };
  const unsubscribe = subscribeRealtime((event) => {
    if (event.type === "reconnect") fallback.request();
    // Connected subscriptions are refreshed on the server, including changes
    // that arrive during a snapshot read. Do not fetch the same delta again.
  });
  window.addEventListener("focus", request);
  window.addEventListener("online", request);
  window.addEventListener(messagesChangedEvent, localChange);
  document.addEventListener("visibilitychange", request);
  fallback.request();
  return {
    request,
    dispose() {
      subscription.dispose();
      fallback.dispose();
      unsubscribe();
      window.removeEventListener("focus", request);
      window.removeEventListener("online", request);
      window.removeEventListener(messagesChangedEvent, localChange);
      document.removeEventListener("visibilitychange", request);
    },
  };
}

export function useDirectUnread() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    async function refresh() {
      const result = await messageRequest<{ unread: number }>(
        "/api/messages?unread=1",
      );
      if (alive) setUnread(result.unread);
    }
    const live = watchRealtime(
      refresh,
      (event) => event.type === "messages" || event.type === "refresh",
      [messagesChangedEvent],
    );
    return () => {
      alive = false;
      live.dispose();
    };
  }, []);
  return unread;
}
