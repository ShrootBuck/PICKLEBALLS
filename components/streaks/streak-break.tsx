"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import {
  type BreakLength,
  breakResumeDay,
  type StreakView,
} from "@/lib/streak-policy";
import { formatDayShort } from "@/lib/time";
import { shiftDateKey } from "@/lib/timeblocks";

const choices: { length: BreakLength; label: string }[] = [
  { length: "today", label: "One day" },
  { length: "week", label: "Rest of this week" },
  { length: "seven-days", label: "One week" },
  { length: "manual", label: "Until I resume" },
];

export function StreakBreakButton({ view }: { view: StreakView }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pause = view.break;
  const recordedToday =
    view.summary.todayState === "done" || view.summary.todayState === "slipped";
  const start = recordedToday
    ? shiftDateKey(view.summary.today, 1)
    : view.summary.today;
  async function save(length?: BreakLength) {
    if (pending) return;
    setPending(true);
    try {
      const response = await appFetch(
        `/api/streaks/${encodeURIComponent(view.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            length ? { action: "pause", length } : { action: "resume" },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not update your streak.");
      setOpen(false);
      toast.add({
        title: length
          ? "Break saved. Your streak is kept."
          : "Break ended. Your schedule is back on.",
        type: "success",
      });
    } catch (error) {
      toast.add({
        title:
          error instanceof Error
            ? error.message
            : "Could not update your streak.",
        type: "error",
      });
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => (pause ? void save() : setOpen(true))}
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : pause ? (
          <Play data-icon="inline-start" />
        ) : (
          <Pause data-icon="inline-start" />
        )}
        {pause
          ? pause.startDay > view.summary.today
            ? "Cancel break"
            : "Resume"
          : "Take a break"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent className="sm:max-w-sm" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Take a break</DialogTitle>
            <DialogDescription>
              Your count stays put. Off days don't need a check-in.
              {recordedToday
                ? " Starts tomorrow so today's result stays."
                : " Starts today. Earlier days stay as they are."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {choices.map(({ length, label }) => {
              const resume = breakResumeDay(start, length);
              return (
                <Button
                  key={length}
                  variant="outline"
                  disabled={pending}
                  className="h-auto justify-between gap-3 py-3"
                  onClick={() => void save(length)}
                >
                  {length === "week" &&
                  start === breakResumeDay(view.summary.today, "week")
                    ? "Next week"
                    : label}
                  <span className="text-xs text-muted-foreground">
                    {resume
                      ? `Back ${formatDayShort(resume)}`
                      : "Resume any time"}
                  </span>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
