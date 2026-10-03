"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const holdMs = 650;
const isActivationKey = (key: string) => key === " " || key === "Enter";

// Press and hold to confirm, so a stray tap never logs a day.
export function HoldButton({
  onConfirm,
  disabled = false,
  className,
  hint = "Press and hold to confirm.",
  children,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  className?: string;
  hint?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const frame = useRef(0);
  const started = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const hintId = useId();

  const paint = (value: number) =>
    ref.current?.style.setProperty("--hold", String(value));
  const cancel = () => {
    if (started.current === null) return;
    cancelAnimationFrame(frame.current);
    started.current = null;
    setHolding(false);
    paint(0);
  };
  const start = () => {
    if (disabled || done || started.current !== null) return;
    started.current = performance.now();
    setHolding(true);
    const tick = (time: number) => {
      if (started.current === null) return;
      const progress = Math.min(1, (time - started.current) / holdMs);
      paint(progress);
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
        return;
      }
      started.current = null;
      setHolding(false);
      setDone(true);
      navigator.vibrate?.(18);
      onConfirm();
    };
    frame.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  // A failed save re-enables the button; let it be held again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the disabled state changes
  useEffect(() => {
    if (!disabled) {
      setDone(false);
      paint(0);
    }
  }, [disabled]);

  return (
    <>
      <Button
        ref={ref}
        type="button"
        size="lg"
        className={cn("hold-button", className)}
        data-initial-focus
        data-holding={holding || undefined}
        data-done={done || undefined}
        disabled={disabled}
        aria-describedby={hintId}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          start();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (!isActivationKey(event.key)) return;
          event.preventDefault();
          if (!event.repeat) start();
        }}
        onKeyUp={(event) => {
          if (!isActivationKey(event.key)) return;
          event.preventDefault();
          cancel();
        }}
        onClick={(event) => {
          // Assistive technology activates without pointer or key events.
          if (event.detail === 0 && started.current === null && !done) {
            setDone(true);
            onConfirm();
          }
        }}
      >
        {children}
      </Button>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </>
  );
}
