"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { requestAppRefresh } from "@/lib/app-refresh";
import { dispatchRealtime } from "@/lib/realtime-client";
import { realtimeEventSchema } from "@/lib/realtime-types";

type Status = "connecting" | "live" | "reconnecting" | "offline" | "paused";
const Context = createContext<Status>("connecting");
export const useRealtimeStatus = () => useContext(Context);

export function RealtimeProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  useEffect(() => {
    if (!userId) return;
    let source: EventSource | null = null;
    let lastEvent = Date.now();
    let signedOut = false;
    const close = () => {
      source?.close();
      source = null;
    };
    const connect = () => {
      if (signedOut) return;
      if (!navigator.onLine || document.visibilityState === "hidden") {
        close();
        setStatus(navigator.onLine ? "paused" : "offline");
        return;
      }
      if (source) return;
      setStatus("connecting");
      lastEvent = Date.now();
      const current = new EventSource("/api/realtime");
      source = current;
      current.onmessage = (message) => {
        if (source !== current) return;
        try {
          const parsed = realtimeEventSchema.safeParse(
            JSON.parse(message.data),
          );
          if (!parsed.success) return;
          lastEvent = Date.now();
          const event = parsed.data;
          if (event.type === "signed-out") {
            dispatchRealtime(event);
            signedOut = true;
            close();
            requestAppRefresh();
          } else if (event.type === "reconnect") {
            dispatchRealtime(event);
            setStatus("reconnecting");
            // The server closes after this event. EventSource handles retry.
          } else {
            if (event.type === "ready") setStatus("live");
            if (event.type !== "ping") dispatchRealtime(event);
          }
        } catch {
          /* Ignore invalid frames. */
        }
      };
      current.onerror = () => {
        if (source === current)
          setStatus(navigator.onLine ? "reconnecting" : "offline");
      };
    };
    connect();
    // Detect a silent proxy/network stall, not just a clean socket close.
    const watchdog = setInterval(() => {
      if (source && Date.now() - lastEvent > 45_000) {
        close();
        connect();
      }
    }, 15_000);
    document.addEventListener("visibilitychange", connect);
    window.addEventListener("online", connect);
    window.addEventListener("offline", connect);
    window.addEventListener("pageshow", connect);
    return () => {
      close();
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", connect);
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", connect);
      window.removeEventListener("pageshow", connect);
    };
  }, [userId]);
  return <Context value={status}>{children}</Context>;
}

export function RealtimeStatus() {
  const status = useRealtimeStatus();
  return (
    <output
      className="text-xs text-muted-foreground"
      data-realtime-status={status}
    >
      {status === "live"
        ? "Live"
        : status === "offline"
          ? "Offline"
          : status === "paused"
            ? "Paused"
            : status === "connecting"
              ? "Connecting…"
              : "Reconnecting…"}
    </output>
  );
}

export function RealtimeNotice() {
  const status = useRealtimeStatus();
  if (status !== "offline" && status !== "reconnecting") return null;
  return (
    <div className="mr-2">
      <RealtimeStatus />
    </div>
  );
}
