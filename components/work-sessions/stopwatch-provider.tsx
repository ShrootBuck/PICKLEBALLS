"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRefreshVersion } from "@/components/layout/app-refresh-provider";
import { useSocial } from "@/components/social/social-provider";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import type { SocialTask } from "@/lib/social-types";
import {
  elapsedMilliseconds,
  formatStopwatch,
  type WorkSessionView,
} from "@/lib/work-session-policy";

type StopwatchContext = {
  active: WorkSessionView | null;
  pending: boolean;
  revision: number;
  clockOffset: number;
  start: (taskId: string) => Promise<void>;
  stop: (id: string) => Promise<boolean>;
  changed: () => void;
};
const Context = createContext<StopwatchContext | null>(null);

export function StopwatchProvider({
  initialActive,
  children,
}: {
  initialActive: WorkSessionView | null;
  children: ReactNode;
}) {
  const { circleId, viewer } = useSocial();
  const version = useRefreshVersion();
  const [active, setActive] = useState(initialActive);
  const [pending, setPending] = useState(false);
  const [revision, setRevision] = useState(0);
  const [clockOffset, setClockOffset] = useState(0);
  const busy = useRef(false);
  const sequence = useRef(0);
  const startRequest = useRef<{ taskId: string; id: string } | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (busy.current || document.visibilityState === "hidden") return;
    const request = ++sequence.current;
    const began = Date.now();
    try {
      const response = await fetch("/api/work-sessions", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (!mounted.current || request !== sequence.current || busy.current)
        return;
      setActive(data.active);
      setClockOffset(Date.parse(data.serverNow) - (began + Date.now()) / 2);
      setRevision((value) => value + 1);
    } catch {
      // A temporary disconnect does not stop a saved stopwatch.
    }
  }, []);

  const changed = useCallback(() => {
    setRevision((value) => value + 1);
    try {
      localStorage.setItem(`pb:stopwatch:${viewer.id}`, crypto.randomUUID());
    } catch {
      /* The server remains authoritative when storage is unavailable. */
    }
  }, [viewer.id]);

  useEffect(() => {
    mounted.current = true;
    const update = () => {
      void refresh();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === `pb:stopwatch:${viewer.id}`) update();
    };
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("online", update);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", update);
    return () => {
      mounted.current = false;
      sequence.current++;
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("online", update);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, viewer.id]);

  useEffect(() => {
    void version;
    void refresh();
  }, [version, refresh]);

  async function mutate(url: string, method: string, body: unknown) {
    if (busy.current) return null;
    busy.current = true;
    sequence.current++;
    setPending(true);
    try {
      const response = await appFetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save the stopwatch.");
      const session = data.session as WorkSessionView;
      if (mounted.current) {
        setActive((current) =>
          session.endedAt
            ? current?.id === session.id
              ? null
              : current
            : session,
        );
        changed();
      }
      return session;
    } catch (error) {
      toast.add({
        title:
          error instanceof Error
            ? error.message
            : "Could not confirm the save. Check your connection and retry.",
        type: "error",
      });
      return null;
    } finally {
      busy.current = false;
      if (mounted.current) {
        setPending(false);
        void refresh();
      }
    }
  }

  async function start(taskId: string) {
    if (!startRequest.current || startRequest.current.taskId !== taskId)
      startRequest.current = { taskId, id: crypto.randomUUID() };
    const saved = await mutate("/api/work-sessions", "POST", {
      ...startRequest.current,
      circleId,
    });
    if (saved) startRequest.current = null;
  }

  async function stop(id: string) {
    const saved = await mutate(
      `/api/work-sessions/${encodeURIComponent(id)}`,
      "PATCH",
      { action: "stop" },
    );
    if (!saved) return false;
    toast.add({
      title: "Work session saved",
      description: "Your time is ready in Timeblock.",
      type: "success",
    });
    return true;
  }

  return (
    <Context
      value={{ active, pending, revision, clockOffset, start, stop, changed }}
    >
      {children}
    </Context>
  );
}

export function useStopwatch() {
  const context = useContext(Context);
  if (!context) throw new Error("Stopwatch components need StopwatchProvider.");
  return context;
}

// The interval redraws the display only. No per-second network traffic, and
// suspended tabs catch up from the stored epoch as soon as they become visible.
export function StopwatchElapsed({
  session,
  prefix = 0,
}: {
  session: WorkSessionView;
  prefix?: number;
}) {
  const { clockOffset } = useStopwatch();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now() + clockOffset);
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [clockOffset]);
  return (
    <span className="font-mono tabular-nums" role="timer" aria-live="off">
      {formatStopwatch(
        prefix +
          elapsedMilliseconds(session, now ?? Date.parse(session.startedAt)),
      )}
    </span>
  );
}

export function useTaskWorkSessions(task: SocialTask | null) {
  const { revision } = useStopwatch();
  const [loaded, setLoaded] = useState<{
    taskId: string;
    sessions: WorkSessionView[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!task);
  const taskId = task?.id;
  useEffect(() => {
    void revision;
    if (!taskId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/work-sessions?${new URLSearchParams({ taskId })}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load recorded time.");
        if (!controller.signal.aborted)
          setLoaded({ taskId, sessions: data.sessions });
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load recorded time.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [taskId, revision]);
  return {
    sessions:
      loaded && loaded.taskId === taskId
        ? loaded.sessions
        : (task?.workSessions ?? []),
    error,
    loading: !!taskId && loading,
  };
}
