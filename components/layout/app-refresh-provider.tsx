"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  Suspense,
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
      <Suspense fallback={null}>
        <RefreshDriver userId={userId} version={version} />
      </Suspense>
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
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const route = `${pathname}?${search}`;
  const previousRoute = useRef(route);
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
      // Cross-tab delivery is optional; focus/navigation still catch up.
    }
    const changed = () => {
      queue.request();
      try {
        channel?.postMessage({ type: "changed", userId });
      } catch {
        // A closed or unavailable channel must never break a saved action.
      }
    };
    const resume = () => {
      updateBlocked();
      if (document.visibilityState !== "hidden" && navigator.onLine) {
        queue.request();
      }
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) resume();
    };
    updateBlocked();
    window.addEventListener(refreshEvent, changed);
    window.addEventListener(refreshBusyEvent, updateBlocked);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", updateBlocked);
    window.addEventListener("pageshow", pageshow);
    document.addEventListener("visibilitychange", resume);
    return () => {
      queue.dispose();
      channel?.close();
      window.removeEventListener(refreshEvent, changed);
      window.removeEventListener(refreshBusyEvent, updateBlocked);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", updateBlocked);
      window.removeEventListener("pageshow", pageshow);
      document.removeEventListener("visibilitychange", resume);
      scheduler.current = null;
    };
  }, [router, userId]);

  useEffect(() => {
    if (previousRoute.current !== route) {
      previousRoute.current = route;
      scheduler.current?.request();
    }
  }, [route]);

  return null;
}
