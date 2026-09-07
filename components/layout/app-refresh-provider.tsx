"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useTransition,
} from "react";
import {
  activeMutations,
  refreshBusyEvent,
  refreshEvent,
} from "@/lib/app-refresh";
import { RefreshScheduler } from "@/lib/refresh-scheduler";

const RefreshVersion = createContext("");
export const useRefreshVersion = () => useContext(RefreshVersion);

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
    <RefreshVersion value={version}>
      <RefreshDriver userId={userId} version={version} />
      {children}
    </RefreshVersion>
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
    // Returning to the tab only unblocks updates from actual saved changes.
    // Focus, history restoration, and connectivity never request fresh data.
    updateBlocked();
    window.addEventListener(refreshEvent, changed);
    window.addEventListener(refreshBusyEvent, updateBlocked);
    window.addEventListener("online", updateBlocked);
    window.addEventListener("offline", updateBlocked);
    window.addEventListener("pageshow", updateBlocked);
    document.addEventListener("visibilitychange", updateBlocked);
    return () => {
      queue.dispose();
      channel?.close();
      window.removeEventListener(refreshEvent, changed);
      window.removeEventListener(refreshBusyEvent, updateBlocked);
      window.removeEventListener("online", updateBlocked);
      window.removeEventListener("offline", updateBlocked);
      window.removeEventListener("pageshow", updateBlocked);
      document.removeEventListener("visibilitychange", updateBlocked);
      scheduler.current = null;
    };
  }, [router, userId]);

  return null;
}
