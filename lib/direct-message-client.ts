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
): Promise<T> {
  const response = await fetch(url, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    ...(body !== undefined
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Couldn't load messages. Try again.");
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
