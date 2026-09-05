"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function BoardSync() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let lastRefresh = 0;
    const sync = () => {
      setOffline(!navigator.onLine);
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      // Keep active forms stable; the next idle tick picks up new activity.
      if (
        document.querySelector(
          '[role="dialog"], [data-slot="popover-content"], [data-slot="dropdown-menu-content"]',
        ) ||
        document.activeElement?.matches(
          "input, textarea, [contenteditable=true]",
        )
      )
        return;
      if (Date.now() - lastRefresh < 5_000) return;
      lastRefresh = Date.now();
      startTransition(() => router.refresh());
    };
    setOffline(!navigator.onLine);
    const timer = window.setInterval(sync, 15_000);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [router]);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending || offline}
      aria-label={
        offline ? "Offline. Reconnect to save changes." : "Refresh board"
      }
      title={
        offline
          ? "Offline. Reconnect to save changes."
          : "Refresh · checks for updates every 15 seconds"
      }
      onClick={() => startTransition(() => router.refresh())}
    >
      {offline ? (
        <WifiOff />
      ) : (
        <RefreshCw className={pending ? "animate-spin" : undefined} />
      )}
    </Button>
  );
}
