"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type { StoryFrame, StoryGroup } from "@/lib/social-types";
import {
  applyStoryViews,
  parseStoryViews,
  type StoryViewReceipt,
  storyViewKey,
} from "@/lib/story-views";

export function useStoryViews(
  viewerId: string,
  circleId: string,
  setStories: Dispatch<SetStateAction<StoryGroup[]>>,
) {
  const storageKey = `pb:story-views:v1:${viewerId}:${circleId}`;
  const receipts = useRef(new Map<string, StoryViewReceipt>());
  const flushing = useRef(false);

  const load = useCallback(() => {
    try {
      for (const [key, receipt] of parseStoryViews(
        localStorage.getItem(storageKey),
      )) {
        const current = receipts.current.get(key);
        // A successful save in either tab wins over an older pending receipt.
        receipts.current.set(key, {
          ...receipt,
          pending: receipt.pending && (current?.pending ?? true),
        });
      }
    } catch {
      // In-memory read state still works when storage is unavailable.
    }
    receipts.current = parseStoryViews(
      JSON.stringify([...receipts.current.values()]),
    );
    return receipts.current;
  }, [storageKey]);

  const persist = useCallback(() => {
    load();
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify([...receipts.current.values()]),
      );
    } catch {
      // Saving to the server does not depend on local storage access.
    }
  }, [load, storageKey]);

  const mergeViews = useCallback(
    (groups: StoryGroup[]) => applyStoryViews(groups, load().values()),
    [load],
  );

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      load();
      for (const [key, receipt] of receipts.current) {
        if (!receipt.pending) continue;
        try {
          const response = await fetch("/api/stories", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              circleId,
              kind: receipt.kind,
              id: receipt.id,
              frame: receipt.frame,
            }),
            keepalive: true,
            signal: AbortSignal.timeout(15_000),
          });
          // Expired or removed attachments cannot be saved. Other failures retry.
          if (
            !response.ok &&
            response.status !== 404 &&
            response.status !== 400
          )
            break;
          receipts.current.set(key, { ...receipt, pending: false });
          persist();
        } catch {
          break;
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [circleId, load, persist]);

  useEffect(() => {
    const sync = () => {
      const saved = [...load().values()];
      setStories((groups) => applyStoryViews(groups, saved));
      if (!document.hidden) void flush();
    };
    const storage = (event: StorageEvent) => {
      if (event.key === storageKey) sync();
    };
    sync();
    const retry = window.setInterval(() => {
      if (!document.hidden) void flush();
    }, 30_000);
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(retry);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [flush, load, setStories, storageKey]);

  const markViewed = useCallback(
    (frame: StoryFrame) => {
      if (frame.seen) return;
      const receipt: StoryViewReceipt = {
        kind: frame.post.kind,
        id: frame.post.id,
        frame: frame.frame,
        createdAt: frame.post.createdAt,
        pending: true,
      };
      const key = storyViewKey(receipt);
      load();
      if (receipts.current.has(key)) return;
      receipts.current.set(key, receipt);
      // Update rings immediately, even on a slow connection or before closing.
      setStories((groups) => applyStoryViews(groups, [receipt]));
      persist();
      void flush();
    },
    [flush, load, persist, setStories],
  );

  return { markViewed, mergeViews };
}
