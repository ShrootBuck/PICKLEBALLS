"use client";

import { useEffect, useState } from "react";
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
