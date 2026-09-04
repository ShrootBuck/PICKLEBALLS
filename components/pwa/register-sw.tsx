"use client";

import { useEffect } from "react";

export function RegisterSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const url = "/sw.js";
    navigator.serviceWorker.register(url, { scope: "/" }).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  }, []);
  return null;
}
