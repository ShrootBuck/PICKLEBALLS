"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { RealtimeProvider } from "@/components/layout/realtime-provider";
import {
  activeMutations,
  refreshBusyEvent,
  refreshEvent,
} from "@/lib/app-refresh";
import { realtimeCatchUpEvent, subscribeRealtime } from "@/lib/realtime-client";
import { RefreshScheduler } from "@/lib/refresh-scheduler";
import { phoenixDateKey, phoenixDayDueAt } from "@/lib/time";

export function AppRefreshProvider({
  children,
  userId,
  version,
}: {
  children: React.ReactNode;
  userId: string | null;
  version: string;
}) {
  return (
    <RealtimeProvider userId={userId}>
      <RefreshDriver userId={userId} version={version} />
      {children}
    </RealtimeProvider>
  );
}

function RefreshDriver({
  userId,
  version,
}: {
  userId: string | null;
  version: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const scheduler = useRef<RefreshScheduler | null>(null);
  const currentVersion = useRef(version);
  const startedVersion = useRef(version);

  useEffect(() => {
    currentVersion.current = version;
    if (!pending && scheduler.current?.running) {
      scheduler.current.complete(version !== startedVersion.current);
    }
  }, [pending, version]);

  useEffect(() => {
    const queue = new RefreshScheduler(() => {
      startedVersion.current = currentVersion.current;
      startTransition(() => router.refresh());
    });
    scheduler.current = queue;
    const updateBlocked = () => {
      queue.setBlocked(
        document.visibilityState === "hidden" ||
          !navigator.onLine ||
          activeMutations() > 0,
      );
    };
    let dayTimer: ReturnType<typeof setTimeout>;
    const scheduleDayChange = () => {
      clearTimeout(dayTimer);
      const now = new Date();
      const end = phoenixDayDueAt(phoenixDateKey(now));
      if (!end) return;
      dayTimer = setTimeout(
        () => {
          queue.request();
          scheduleDayChange();
        },
        Math.max(1000, end.getTime() - now.getTime() + 1),
      );
    };
    const catchUp = () => {
      updateBlocked();
      queue.request();
      if (userId) scheduleDayChange();
    };
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel("pb:data-changed:v1");
      channel.onmessage = (event) => {
        if (event.data?.type === "changed" && event.data.userId === userId) {
          queue.request();
        }
      };
    } catch {
      // Cross-tab delivery is optional; local saved actions still sync.
    }
    const changed = () => {
      queue.request();
      try {
        channel?.postMessage({ type: "changed", userId });
      } catch {
        // A closed or unavailable channel must never break a saved action.
      }
    };
    const unsubscribe = subscribeRealtime((event) => {
      if (event.type === "refresh" || event.type === "ready") queue.request();
    });
    updateBlocked();
    if (userId) scheduleDayChange();
    window.addEventListener(refreshEvent, changed);
    window.addEventListener(refreshBusyEvent, updateBlocked);
    window.addEventListener(realtimeCatchUpEvent, catchUp);
    window.addEventListener("focus", catchUp);
    window.addEventListener("online", catchUp);
    window.addEventListener("offline", updateBlocked);
    window.addEventListener("pageshow", catchUp);
    document.addEventListener("visibilitychange", catchUp);
    return () => {
      clearTimeout(dayTimer);
      queue.dispose();
      unsubscribe();
      channel?.close();
      window.removeEventListener(refreshEvent, changed);
      window.removeEventListener(refreshBusyEvent, updateBlocked);
      window.removeEventListener(realtimeCatchUpEvent, catchUp);
      window.removeEventListener("focus", catchUp);
      window.removeEventListener("online", catchUp);
      window.removeEventListener("offline", updateBlocked);
      window.removeEventListener("pageshow", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
      scheduler.current = null;
    };
  }, [router, userId]);

  return null;
}
