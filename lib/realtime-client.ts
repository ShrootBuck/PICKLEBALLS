"use client";

import type { RealtimeEvent } from "@/lib/realtime-types";

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
