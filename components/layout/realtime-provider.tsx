"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { requestAppRefresh } from "@/lib/app-refresh";
import { openRealtime, subscribeRealtime } from "@/lib/realtime-client";
import type { RealtimeStatus as Status } from "@/lib/realtime-connection";

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
    let disposed = false;
    let lastSessionCheck = 0;
    const verifySession = () => {
      if (Date.now() - lastSessionCheck < 30_000) return;
      lastSessionCheck = Date.now();
      // A failed HTTP upgrade cannot expose its 401 status to browser JS.
      void fetch("/api/auth/get-session", {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      })
        .then(async (response) => {
          if (response.ok && !(await response.json()) && !disposed)
            requestAppRefresh();
        })
        .catch(() => {});
    };
    const url = new URL("/api/realtime", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const connection = openRealtime(url.href, setStatus, verifySession);
    const unsubscribe = subscribeRealtime((event) => {
      if (event.type === "signed-out") requestAppRefresh();
    });
    const connect = () =>
      connection.setActive(
        document.visibilityState !== "hidden",
        navigator.onLine,
      );
    const pagehide = () => connection.setActive(false, navigator.onLine);
    connect();
    document.addEventListener("visibilitychange", connect);
    window.addEventListener("online", connect);
    window.addEventListener("offline", connect);
    window.addEventListener("pageshow", connect);
    window.addEventListener("pagehide", pagehide);
    return () => {
      disposed = true;
      connection.dispose();
      unsubscribe();
      document.removeEventListener("visibilitychange", connect);
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", connect);
      window.removeEventListener("pageshow", connect);
      window.removeEventListener("pagehide", pagehide);
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
