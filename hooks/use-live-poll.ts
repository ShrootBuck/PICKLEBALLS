"use client";

import { useEffect, useRef } from "react";
import { startLivePoll } from "@/lib/live-poll";

export function useLivePoll(
  read: (signal: AbortSignal) => Promise<void>,
  interval: number,
  enabled = true,
) {
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });
  useEffect(() => {
    if (!enabled) return;
    return startLivePoll((signal) => latest.current(signal), interval);
  }, [interval, enabled]);
}
