"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { type CSSProperties, useEffect, useState } from "react";
import { StreakEmber } from "@/components/streaks/streak-visuals";
import { Button } from "@/components/ui/button";

export type StreakCelebration = {
  emoji: string;
  title: string;
  kind: "QUIT" | "BUILD";
  visibility: "CIRCLE" | "PRIVATE";
  milestone: number;
  stat: string | null;
};

const celebrateEvent = "pb:streak-milestone";

// The host lives in the layout, so the moment survives the logged row
// disappearing when the page refreshes.
export function celebrateStreak(detail: StreakCelebration) {
  window.dispatchEvent(new CustomEvent(celebrateEvent, { detail }));
}

const colors = [
  "var(--primary)",
  "var(--success)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--like)",
];

function Confetti() {
  return (
    <div className="streak-confetti" aria-hidden="true">
      {Array.from({ length: 32 }, (_, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative pieces
          key={index}
          style={
            {
              "--x": `${(index * 37) % 100}%`,
              "--delay": `${(index % 8) * 0.11}s`,
              "--duration": `${2.4 + ((index * 13) % 10) / 10}s`,
              "--drift": `${((index * 29) % 120) - 60}px`,
              "--spin": `${360 + ((index * 47) % 540)}deg`,
              "--c": colors[index % colors.length],
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function StreakCelebrationHost() {
  const [detail, setDetail] = useState<StreakCelebration | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const listener = (event: Event) => {
      setDetail((event as CustomEvent<StreakCelebration>).detail);
      setOpen(true);
    };
    window.addEventListener(celebrateEvent, listener);
    return () => window.removeEventListener(celebrateEvent, listener);
  }, []);
  if (!detail) return null;
  const unit = detail.kind === "QUIT" ? "days clean" : "days in a row";
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => {
        if (!next) setDetail(null);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup className="streak-celebration">
          <Confetti />
          <div className="streak-celebration-body">
            <StreakEmber count={detail.milestone} size={132} />
            <p className="streak-celebration-number" aria-hidden="true">
              {detail.milestone}
            </p>
            <DialogPrimitive.Title className="text-xl font-semibold tracking-tight">
              {detail.milestone} {unit}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {detail.emoji} {detail.title}
              {detail.stat ? `. ${detail.stat}.` : "."}
            </DialogPrimitive.Description>
            <p className="text-xs text-muted-foreground">
              {detail.visibility === "CIRCLE"
                ? "Your circle will see this milestone in the feed."
                : "A private streak. This one is just for you."}
            </p>
            <DialogPrimitive.Close
              render={<Button size="lg" className="mt-4 min-w-44" />}
            >
              Keep going
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
