"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
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

  const paint = useCallback((value: number) => {
    ref.current?.style.setProperty("--hold", String(value));
  }, []);
  const cancel = useCallback(() => {
    if (started.current === null) return;
    cancelAnimationFrame(frame.current);
    started.current = null;
    setHolding(false);
    paint(0);
  }, [paint]);
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

  useEffect(() => {
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [cancel]);
  // A failed save re-enables the button; let it be held again.
  useEffect(() => {
    if (disabled) cancel();
    else {
      setDone(false);
      paint(0);
    }
  }, [disabled, cancel, paint]);

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
        onPointerMove={(event) => {
          if (started.current === null) return;
          // Pointer capture keeps delivering moves after the finger or mouse
          // leaves the button. Moving away should cancel the confirmation.
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            cancel();
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onBlur={cancel}
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
