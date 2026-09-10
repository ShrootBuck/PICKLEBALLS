"use client";

import { ArrowDown, RefreshCw } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

// Keep touch feedback outside the feed's state so moving a finger does not
// rerender every post. The indicator overlays content without moving it.
export function PullToRefresh({
  children,
  disabled,
  onRefresh,
}: {
  children: ReactNode;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const distance = useRef(0);
  const [phase, setPhase] = useState<"idle" | "pulling" | "ready">("idle");
  function reset() {
    start.current = null;
    distance.current = 0;
    setPhase("idle");
  }
  return (
    <div
      className="relative"
      onTouchStart={(event) => {
        reset();
        const scroll = event.currentTarget.closest(
          '[data-slot="social-scroll"]',
        );
        if (
          disabled ||
          event.touches.length !== 1 ||
          scroll?.scrollTop !== 0 ||
          (event.target instanceof Element &&
            event.target.closest(
              "a, button, input, textarea, video, .media-slides",
            ))
        )
          return;
        const touch = event.touches[0];
        start.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchMove={(event) => {
        if (!start.current) return;
        if (disabled || event.touches.length !== 1) {
          reset();
          return;
        }
        const dx = Math.abs(event.touches[0].clientX - start.current.x);
        const dy = event.touches[0].clientY - start.current.y;
        if (dx > 25 || dy < 0) {
          reset();
          return;
        }
        distance.current = dy;
        setPhase(dy >= 80 ? "ready" : dy > 15 ? "pulling" : "idle");
      }}
      onTouchEnd={() => {
        const refresh = !disabled && distance.current >= 80;
        reset();
        if (refresh) onRefresh();
      }}
      onTouchCancel={reset}
    >
      {phase !== "idle" && (
        <output className="pointer-events-none absolute inset-x-0 top-0 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs shadow-sm">
          {phase === "ready" ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )}
          {phase === "ready" ? "Release to refresh" : "Pull to refresh"}
        </output>
      )}
      {children}
    </div>
  );
}
