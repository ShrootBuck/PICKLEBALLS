"use client";

import type Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Playback = { url: string; hlsUrl: string | null; expiresAt: number };

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
    let hls: Hls | undefined;
    let playback: Playback | undefined;
    let loading = false;
    let near = eager || attempt > 0;
    let fallback = false;
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
    const fallBackToMp4 = (resume = false) => {
      if (!alive()) return;
      position.current = video.currentTime || position.current;
      hls?.destroy();
      hls = undefined;
      fallback = true;
      video.preload = conserve ? "none" : "metadata";
      video.src = playback?.url ?? src;
      video.load();
      if (resume) void video.play().catch(() => {});
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
        hls?.destroy();
        hls = undefined;
        fallback = false;
        clearTimeout(expiresTimer);
        // Refresh authorization before an hours-long viewing session expires.
        expiresTimer = setTimeout(
          () => {
            playback = undefined;
            if (near || !video.paused) void start(true);
          },
          Math.max(1000, ticket.expiresAt - Date.now() - 60_000),
        );
        if (
          ticket.hlsUrl &&
          video.canPlayType("application/vnd.apple.mpegurl") &&
          (/Apple/.test(navigator.vendor) || !("MediaSource" in window))
        ) {
          video.preload = conserve ? "none" : "metadata";
          video.src = ticket.hlsUrl;
          video.load();
        } else if (ticket.hlsUrl) {
          const { default: HlsClient } = await import("hls.js");
          if (!alive()) return;
          if (HlsClient.isSupported()) {
            const instance = new HlsClient({
              enableWorker: false,
              autoStartLoad: false,
              startLevel: 0,
              capLevelToPlayerSize: true,
              maxBufferLength: 6,
              maxMaxBufferLength: 12,
              backBufferLength: 10,
            });
            hls = instance;
            instance.on(HlsClient.Events.MANIFEST_PARSED, () => {
              if ((!conserve && near) || !video.paused)
                instance.startLoad(position.current || -1);
            });
            instance.on(HlsClient.Events.FRAG_BUFFERED, () => {
              if (
                video.paused &&
                video.buffered.length &&
                video.buffered.end(video.buffered.length - 1) -
                  video.currentTime >=
                  4
              )
                instance.stopLoad();
            });
            instance.on(HlsClient.Events.ERROR, (_, data) => {
              if (!data.fatal || !alive()) return;
              // hls.js handles bounded transport retries. Refresh a rejected ticket
              // once, then fall back to the independently playable MP4.
              if (!refreshed && [401, 403].includes(data.response?.code ?? 0)) {
                refreshed = true;
                void start(true);
              } else fallBackToMp4(!video.paused);
            });
            instance.loadSource(ticket.hlsUrl);
            instance.attachMedia(video);
          } else fallBackToMp4();
        } else fallBackToMp4();
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
      if (hls) {
        hls.config.maxBufferLength = 30;
        hls.config.maxMaxBufferLength = 60;
        hls.startLoad(-1);
      }
    };
    const pause = () => hls?.stopLoad();
    const seek = () => {
      position.current = video.currentTime;
      hls?.startLoad(video.currentTime);
    };
    const error = () => {
      if (!alive()) return;
      if (!fallback) fallBackToMp4(!video.paused);
      else setFailed(true);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        video.pause();
        hls?.stopLoad();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        near = entry.isIntersecting;
        if (near) {
          video.poster = `${src}?poster=1`;
          void start();
          if (!conserve) hls?.startLoad(-1);
        } else {
          video.pause();
          hls?.stopLoad();
        }
      },
      { rootMargin: "250px 0px" },
    );
    observer.observe(video);
    video.addEventListener("loadedmetadata", restore);
    video.addEventListener("play", play);
    video.addEventListener("pause", pause);
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
      video.removeEventListener("pause", pause);
      video.removeEventListener("seeking", seek);
      video.removeEventListener("error", error);
      hls?.destroy();
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
