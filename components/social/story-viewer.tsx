"use client";

import {
  ArrowUpRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Pause,
  Play,
  Plus,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PostInteractions } from "@/components/social/post-interactions";
import { PostTimestamp } from "@/components/social/post-timestamp";
import { useSocial } from "@/components/social/social-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { memberHref, postHref } from "@/lib/navigation";
import { postKey, type StoryFrame, type StoryGroup } from "@/lib/social-types";
import { firstUnseenFrame, storyFrames } from "@/lib/stories";
import { cn } from "@/lib/utils";

export function StoryViewer({
  groups,
  authorId,
  returnFocus,
  onViewed,
  onClose,
}: {
  groups: StoryGroup[];
  authorId: string;
  returnFocus?: HTMLElement;
  onViewed: (frame: StoryFrame) => void;
  onClose: () => void;
}) {
  const { viewer, openComposer } = useSocial();
  const [position, setPosition] = useState(() => {
    const group = Math.max(
      0,
      groups.findIndex((item) => item.author.id === authorId),
    );
    return { group, frame: firstUnseenFrame(groups[group]) };
  });
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [holding, setHolding] = useState(false);
  const [away, setAway] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [readyFrame, setReadyFrame] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ x: number; y: number; at: number } | null>(null);
  const ignoreClick = useRef(false);
  const group = groups[position.group];
  const frames = useMemo(() => storyFrames(group), [group]);
  const frame = frames[position.frame];
  const nextFrame =
    frames[position.frame + 1] ??
    (groups[position.group + 1]
      ? storyFrames(groups[position.group + 1])[
          firstUnseenFrame(groups[position.group + 1])
        ]
      : null);
  const post = frame.post;
  const mine = group.author.id === viewer.id;
  const stopped = paused || holding || away || commentsOpen;
  const move = useCallback(
    (direction: number) => {
      const next = position.frame + direction;
      const length = storyFrames(groups[position.group]).length;
      if (next >= 0 && next < length) setPosition({ ...position, frame: next });
      else {
        const nextGroup = position.group + direction;
        if (nextGroup >= groups.length) {
          onClose();
          return;
        }
        if (nextGroup < 0) return;
        setPosition({
          group: nextGroup,
          frame:
            direction > 0
              ? firstUnseenFrame(groups[nextGroup])
              : storyFrames(groups[nextGroup]).length - 1,
        });
      }
      setProgress(0);
    },
    [groups, position, onClose],
  );
  useEffect(() => {
    const visible = () => setAway(document.hidden || !document.hasFocus());
    const release = () => setHolding(false);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("blur", visible);
    window.addEventListener("focus", visible);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("blur", visible);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="story-viewer"
        showCloseButton={false}
        initialFocus={closeButton}
        finalFocus={() => returnFocus ?? false}
        onKeyDown={(event) => {
          if (
            commentsOpen ||
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement
          )
            return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            move(event.key === "ArrowRight" ? 1 : -1);
          }
          if (
            event.key === " " &&
            !(event.target instanceof HTMLButtonElement) &&
            !(event.target instanceof HTMLAnchorElement)
          ) {
            event.preventDefault();
            setPaused((value) => !value);
          }
        }}
      >
        <DialogTitle className="sr-only">
          {mine ? "Your story" : `${group.author.name}’s story`}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Proof and check-ins from the last 24 hours. Use the previous and next
          buttons or arrow keys to browse. Hold a photo or video to pause.
          Escape closes stories.
        </DialogDescription>
        <div className="story-top">
          <nav className="story-progress" aria-label="Story progress">
            {frames.map((item, index) => (
              <Button
                variant="plain"
                type="button"
                key={item.key}
                className="story-progress-step"
                aria-label={`Story ${index + 1} of ${frames.length}${item.seen ? ", seen" : ""}`}
                aria-current={index === position.frame ? "step" : undefined}
                onClick={() => {
                  setPosition({ ...position, frame: index });
                  setProgress(0);
                }}
              >
                <span>
                  <span
                    style={{
                      transform: `scaleX(${index < position.frame ? 1 : index === position.frame ? progress : 0})`,
                    }}
                  />
                </span>
              </Button>
            ))}
          </nav>
          <header className="story-header">
            <Link
              className="flex min-w-0 flex-1 items-center gap-2.5"
              href={
                mine ? "/profile" : memberHref(post.circleId, group.author.id)
              }
              aria-label={`Open ${group.author.name}’s profile`}
            >
              <Avatar className="size-9">
                <AvatarImage src={group.author.image ?? undefined} alt="" />
                <AvatarFallback>{group.author.initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {mine ? "Your story" : group.author.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  <PostTimestamp dateTime={post.createdAt} />
                </span>
              </span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label={paused ? "Play stories" : "Pause stories"}
              onClick={() => setPaused((value) => !value)}
            >
              {paused ? <Play /> : <Pause />}
            </Button>
            {frame.media?.video && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={muted ? "Unmute story" : "Mute story"}
                onClick={() => setMuted((value) => !value)}
              >
                {muted ? <VolumeX /> : <Volume2 />}
              </Button>
            )}
            <Button
              ref={closeButton}
              variant="ghost"
              size="icon"
              aria-label="Close stories"
              onClick={onClose}
            >
              <X />
            </Button>
          </header>
        </div>
        <div
          className="story-stage"
          onPointerDown={(event) => {
            if ((event.target as Element).closest("a, button:not(.story-tap)"))
              return;
            ignoreClick.current = false;
            gesture.current = {
              x: event.clientX,
              y: event.clientY,
              at: performance.now(),
            };
            setHolding(true);
          }}
          onPointerUp={(event) => {
            const start = gesture.current;
            gesture.current = null;
            setHolding(false);
            if (!start) return;
            const dx = event.clientX - start.x,
              dy = event.clientY - start.y;
            ignoreClick.current =
              performance.now() - start.at > 250 ||
              Math.abs(dx) > 30 ||
              Math.abs(dy) > 30;
            if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy))
              move(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => {
            gesture.current = null;
            setHolding(false);
          }}
        >
          {[
            frame,
            ...(nextFrame && readyFrame === frame.key ? [nextFrame] : []),
          ].map((scene) => (
            <div
              key={scene.key}
              className="story-scene"
              hidden={scene.key !== frame.key}
              inert={scene.key !== frame.key}
            >
              <StoryScene
                frame={scene}
                active={scene.key === frame.key}
                paused={scene.key !== frame.key || stopped}
                visible={scene.key === frame.key && !away && !commentsOpen}
                muted={muted}
                onReady={() => {
                  if (scene.key === frame.key) setReadyFrame(scene.key);
                }}
                onProgress={
                  scene.key === frame.key ? setProgress : ignoreProgress
                }
                onEnd={() => {
                  if (scene.key === frame.key) move(1);
                }}
                onViewed={onViewed}
              />
            </div>
          ))}
          <Button
            variant="plain"
            type="button"
            className="story-tap story-tap-previous"
            aria-label="Previous story"
            disabled={position.group === 0 && position.frame === 0}
            onClick={() => {
              if (!ignoreClick.current) move(-1);
            }}
          />
          <Button
            variant="plain"
            type="button"
            className="story-tap story-tap-next"
            aria-label="Next story"
            onClick={() => {
              if (!ignoreClick.current) move(1);
            }}
          />
        </div>
        <footer className="story-footer">
          {post.kind === "proof" && (
            <div className="story-caption">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{post.title}</p>
                <Badge
                  variant={
                    post.reviewStatus === "APPROVED"
                      ? "success"
                      : post.reviewStatus === "CHALLENGED"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {post.reviewStatus === "APPROVED" ? (
                    <>
                      <BadgeCheck data-icon="inline-start" />
                      Verified
                    </>
                  ) : post.reviewStatus === "CHALLENGED" ? (
                    "Challenged"
                  ) : (
                    "Needs review"
                  )}
                </Badge>
              </div>
              {post.body && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {post.body}
                </p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-1">
            <PostInteractions
              key={postKey(post)}
              post={post}
              onCommentsOpenChange={setCommentsOpen}
            />
            {mine ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose();
                  openComposer({ mode: "story", source: "story" });
                }}
              >
                <Plus data-icon="inline-start" />
                Add more
              </Button>
            ) : (
              <Button
                nativeButton={false}
                variant="ghost"
                size="sm"
                render={
                  <Link href={postHref(post.circleId, post.kind, post.id)} />
                }
              >
                {post.kind === "proof" && post.canReview
                  ? "Review proof"
                  : "Open post"}
                <ArrowUpRight data-icon="inline-end" />
              </Button>
            )}
          </div>
          <div className="story-bottom">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Go to previous story"
              disabled={position.group === 0 && position.frame === 0}
              onClick={() => move(-1)}
            >
              <ChevronLeft />
            </Button>
            <span aria-live="polite">
              {position.frame + 1} / {frames.length}
              <span className="mx-2">·</span>
              {paused ? "Paused" : "Hold to pause"}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Go to next story"
              onClick={() => move(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

const ignoreProgress = () => {};

function StoryScene({
  frame,
  active,
  onReady,
  paused,
  visible,
  muted,
  onProgress,
  onEnd,
  onViewed,
}: {
  frame: StoryFrame;
  active: boolean;
  onReady: () => void;
  paused: boolean;
  visible: boolean;
  muted: boolean;
  onProgress: (value: number) => void;
  onEnd: () => void;
  onViewed: (frame: StoryFrame) => void;
}) {
  const [ready, setReady] = useState(!frame.media);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playback, setPlayback] = useState<{
    url: string;
    duration: number | null;
    poster: string | null;
  } | null>(null);
  useEffect(() => {
    if (!frame.media?.video) return;
    let cancelled = false;
    void fetch(`${frame.media.src}?playback=1&attempt=${attempt}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Video unavailable");
        const info = await response.json();
        if (!cancelled) setPlayback(info);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [frame.media?.src, frame.media?.video, attempt]);
  useEffect(() => {
    if (active && ready) onReady();
  }, [active, ready, onReady]);
  const video = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const end = useRef(onEnd);
  const viewed = useRef(onViewed);
  useEffect(() => {
    end.current = onEnd;
    viewed.current = onViewed;
  }, [onEnd, onViewed]);
  useEffect(() => {
    if (
      !ready ||
      !visible ||
      error ||
      buffering ||
      (frame.media?.video && (blocked || paused))
    )
      return;
    const timer = window.setTimeout(() => viewed.current(frame), 600);
    return () => window.clearTimeout(timer);
  }, [ready, visible, error, buffering, blocked, paused, frame]);
  useEffect(() => {
    if (!ready || paused || error || frame.media?.video) return;
    const duration = frame.media
      ? 7000
      : Math.max(7000, (frame.post.body?.length ?? 0) * 55);
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += now - previous;
      previous = now;
      onProgress(Math.min(1, elapsed.current / duration));
      if (elapsed.current >= duration) {
        window.clearInterval(timer);
        end.current();
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [ready, paused, error, frame.media, frame.post.body, onProgress]);
  useEffect(() => {
    const node = video.current;
    if (!node || !ready) return;
    if (paused) node.pause();
    else if (node.ended) end.current();
    else
      void node
        .play()
        .then(() => setBlocked(false))
        .catch((error) => {
          if (error?.name !== "AbortError") setBlocked(true);
        });
  }, [paused, ready]);
  if (error)
    return (
      <div className="story-media-message">
        <ImageOff className="size-8" />
        <p>This attachment didn’t load.</p>
        <Button
          variant="secondary"
          onClick={() => {
            setError(false);
            setReady(false);
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
        <p className="text-xs text-muted-foreground">
          You can still move to the next story.
        </p>
      </div>
    );
  const post = frame.post;
  return (
    <>
      {(!ready || buffering) && (
        <output className="story-media-message">
          <Spinner />
          <span>Loading story</span>
        </output>
      )}
      {frame.media ? (
        frame.media.video ? (
          <>
            <video
              key={attempt}
              ref={video}
              src={playback?.url}
              poster={playback?.poster ?? undefined}
              className="story-media"
              playsInline
              muted={muted}
              preload={active || !ready ? "auto" : "none"}
              disablePictureInPicture
              tabIndex={-1}
              aria-label={post.kind === "proof" ? post.title : "Story video"}
              onLoadedData={() => setReady(true)}
              onWaiting={() => setBuffering(true)}
              onPlaying={() => {
                setBuffering(false);
                setBlocked(false);
              }}
              onCanPlay={() => setBuffering(false)}
              onError={() => setError(true)}
              onTimeUpdate={(event) => {
                const node = event.currentTarget;
                const duration = playback?.duration ?? node.duration;
                if (Number.isFinite(duration) && duration > 0)
                  onProgress(Math.min(1, node.currentTime / duration));
              }}
              onEnded={() => {
                if (!paused) end.current();
              }}
            />
            {blocked && !paused && (
              <Button
                className="story-video-play"
                onClick={() => {
                  void video.current
                    ?.play()
                    .then(() => setBlocked(false))
                    .catch(() => setBlocked(true));
                }}
              >
                <Play data-icon="inline-start" />
                Play video
              </Button>
            )}
          </>
        ) : (
          // biome-ignore lint/performance/noImgElement: private authenticated media
          <img
            key={attempt}
            src={frame.media.src}
            className="story-media"
            alt={
              post.kind === "proof"
                ? `${post.title}, attachment ${frame.frame + 1}`
                : "Story"
            }
            draggable={false}
            onLoad={() => setReady(true)}
            onError={() => setError(true)}
          />
        )
      ) : (
        <div
          className={cn(
            "story-text",
            post.kind === "check-in" &&
              ["NAY", "AT_RISK"].includes(post.signal) &&
              "needs-a-hand",
          )}
        >
          <div className="story-text-inner">
            <Badge variant="secondary">
              {post.kind === "check-in" &&
              ["NAY", "AT_RISK"].includes(post.signal)
                ? "Could use a hand"
                : "Going well"}
            </Badge>
            <p
              className={cn(
                "story-quote",
                (post.body?.length ?? 0) > 200 && "story-quote-long",
              )}
            >
              {post.body || "Showing up. Getting it done."}
            </p>
            <span className="story-text-signature">
              {post.author.name.split(" ")[0]}’s check-in
            </span>
          </div>
        </div>
      )}
    </>
  );
}
