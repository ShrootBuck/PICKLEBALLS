"use client";

import { LiveRefresh } from "@/lib/live-refresh";
import { realtimeCatchUpEvent, subscribeRealtime } from "@/lib/realtime-client";
import type { RealtimeEvent } from "@/lib/realtime-types";

export function watchRealtime(
  read: () => Promise<void>,
  accepts: (event: RealtimeEvent) => boolean,
  localEvents: string[] = [],
) {
  const queue = new LiveRefresh(
    read,
    () => document.visibilityState !== "hidden" && navigator.onLine,
  );
  const unsubscribe = subscribeRealtime((event) => {
    if (event.type === "ready" || accepts(event)) queue.request();
  });
  const events = [
    "focus",
    "online",
    "pageshow",
    realtimeCatchUpEvent,
    ...localEvents,
  ];
  for (const event of events) window.addEventListener(event, queue.request);
  document.addEventListener("visibilitychange", queue.request);
  queue.request();
  return {
    request: queue.request,
    dispose() {
      queue.dispose();
      unsubscribe();
      for (const event of events)
        window.removeEventListener(event, queue.request);
      document.removeEventListener("visibilitychange", queue.request);
    },
  };
}
