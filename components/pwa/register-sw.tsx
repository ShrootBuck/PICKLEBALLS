"use client";

import { useEffect } from "react";

export function RegisterSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "pb:push-received")
        window.dispatchEvent(new Event("pb:push-received"));
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    const url = "/sw.js";
    navigator.serviceWorker.register(url, { scope: "/" }).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
