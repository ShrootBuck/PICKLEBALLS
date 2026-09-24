"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Playback = { url: string; expiresAt: number };

export function VideoPlayer({
  src,
  label,
  slide,
  active = true,
  eager = false,
}: {
  src: string;
  label: string;
  slide?: number;
  active?: boolean;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video || !active) return;
    const controller = new AbortController();
    let playback: Playback | undefined;
    let loading = false;
    let near = eager || attempt > 0;
    let refreshed = false;
    let expiresTimer: ReturnType<typeof setTimeout> | undefined;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const conserve =
      connection?.saveData ||
      ["slow-2g", "2g"].includes(connection?.effectiveType ?? "");
    const alive = () => !controller.signal.aborted;
    const restore = () => {
      if (position.current > 0 && Number.isFinite(video.duration))
        video.currentTime = Math.min(
          position.current,
          Math.max(0, video.duration - 0.1),
        );
    };
    const start = async (force = false) => {
      if (loading || !alive() || (!force && playback)) return;
      loading = true;
      try {
        const response = await fetch(`${src}?playback=1`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Video unavailable.");
        const ticket: Playback = await response.json();
        if (!alive()) return;
        const resume = !video.paused;
        position.current = video.currentTime || position.current;
        playback = ticket;
        clearTimeout(expiresTimer);
        // Refresh authorization before an hours-long viewing session expires.
        expiresTimer = setTimeout(
          () => {
            playback = undefined;
            if (near || !video.paused) void start(true);
          },
          Math.max(1000, ticket.expiresAt - Date.now() - 60_000),
        );
        video.preload = conserve ? "none" : "metadata";
        video.src = ticket.url;
        video.load();
        if (resume) void video.play().catch(() => {});
      } catch {
        if (alive()) setFailed(true);
      } finally {
        loading = false;
      }
    };
    const play = () => {
      for (const other of document.querySelectorAll("video"))
        if (other !== video) other.pause();
      if (!playback) void start(true);
    };
    const seek = () => {
      position.current = video.currentTime;
    };
    const error = () => {
      if (!alive()) return;
      // A signed URL can be rejected after sleep or a long pause. Renew it once.
      if (!refreshed) {
        refreshed = true;
        void start(true);
      } else setFailed(true);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") video.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        near = entry.isIntersecting;
        if (near) {
          video.poster = `${src}?poster=1`;
          void start();
        } else video.pause();
      },
      { rootMargin: "250px 0px" },
    );
    observer.observe(video);
    video.addEventListener("loadedmetadata", restore);
    video.addEventListener("play", play);
    video.addEventListener("seeking", seek);
    video.addEventListener("error", error);
    document.addEventListener("visibilitychange", visibility);
    if (eager || attempt > 0) void start();
    return () => {
      position.current = video.currentTime || position.current;
      controller.abort();
      clearTimeout(expiresTimer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      video.removeEventListener("loadedmetadata", restore);
      video.removeEventListener("play", play);
      video.removeEventListener("seeking", seek);
      video.removeEventListener("error", error);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src, active, eager, attempt]);

  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: member-uploaded evidence has no caption track */}
      <video
        ref={ref}
        data-slide={slide}
        poster={eager ? `${src}?poster=1` : undefined}
        controls
        loop
        playsInline
        preload="none"
        aria-label={label}
      />
      {failed && (
        <Alert className="absolute inset-x-3 bottom-12 w-auto">
          <AlertDescription className="flex items-center justify-between gap-2">
            Video couldn’t load.
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFailed(false);
                setAttempt((value) => value + 1);
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
