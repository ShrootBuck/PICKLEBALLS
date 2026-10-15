"use client";

import { useEffect, useState } from "react";

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
    let pending = false;
    async function refresh() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const result = await messageRequest<{ unread: number }>(
          "/api/messages?unread=1",
        );
        if (alive) setUnread(result.unread);
      } catch {
        /* Keep the last count while offline; retry on focus or the next tick. */
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(messagesChangedEvent, refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(messagesChangedEvent, refresh);
    };
  }, []);
  return unread;
}
