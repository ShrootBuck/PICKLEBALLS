"use client";

import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { type ComponentProps, useId, useRef, useState } from "react";
import { HoldButton } from "@/components/streaks/hold-button";
import { celebrateStreak } from "@/components/streaks/streak-celebration";
import {
  countLabel,
  daysLabel,
  totalsParts,
} from "@/components/streaks/streak-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { appFetch, holdAppRefresh } from "@/lib/app-refresh";
import {
  formatStreakUnits,
  hundredthsToInput,
  parseUnitsInput,
  type StreakCardSummary,
  type StreakView,
  slipWindow,
  streakActions,
} from "@/lib/streak-policy";
import {
  formatDayLong,
  parsePhoenixLocalDateTime,
  phoenixLocalDateTimeValue,
  phoenixWallToDate,
} from "@/lib/time";

function logButtonLabel(streak: StreakView) {
  const actions = streakActions(streak, streak.summary);
  if (streak.kind === "QUIT")
    return actions.confirmDay ? "Confirm yesterday" : "Log a slip";
  return streak.summary.todayState === "done" ? "Log more" : "Log today";
}

export function StreakLogButton({
  streak,
  size = "sm",
  className,
}: {
  streak: StreakView;
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const actions = streakActions(streak, streak.summary);
  const quiet = streak.kind === "QUIT" && !actions.confirmDay;
  const label = logButtonLabel(streak);
  return (
    <>
      <Button
        size={size}
        variant={quiet ? "outline" : "default"}
        className={className}
        onClick={() => setOpen(true)}
      >
        {quiet ? null : streak.summary.todayState === "done" &&
          streak.kind === "BUILD" ? (
          <Plus data-icon="inline-start" />
        ) : (
          <Check data-icon="inline-start" />
        )}
        {label}
      </Button>
      {open && (
        <StreakLogSheet streak={streak} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

type Mode = "confirm" | "slip" | "log";

function StreakLogSheet({
  streak,
  onClose,
}: {
  streak: StreakView;
  onClose: () => void;
}) {
  const id = useId();
  const { summary } = streak;
  const actions = streakActions(streak, summary);
  const quit = streak.kind === "QUIT";
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<Mode>(
    quit ? (actions.confirmDay ? "confirm" : "slip") : "log",
  );
  const [cameFromConfirm, setCameFromConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [day, setDay] = useState(() =>
    !quit &&
    summary.yesterdayState === "pending" &&
    summary.todayState === "done"
      ? summary.yesterday
      : summary.today,
  );
  const [amount, setAmount] = useState(hundredthsToInput(streak.dailyUnits));
  const [bounds] = useState(() => {
    const range = slipWindow(streak.startedAt);
    return {
      min: phoenixLocalDateTimeValue(range.min),
      max: phoenixLocalDateTimeValue(range.max),
    };
  });
  const [when, setWhen] = useState(bounds.max);
  const releaseRefresh = useRef<(() => void) | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const loggedUnits = summary.week.find((item) => item.day === day)?.units ?? 0;

  async function submit(body: Record<string, unknown>) {
    if (pending) return;
    setPending(true);
    setError(null);
    // Keep the page still until the sheet has slid away.
    const release = holdAppRefresh();
    try {
      const response = await appFetch(
        `/api/streaks/${encodeURIComponent(streak.id)}/entries`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data: {
        error?: string;
        summary?: StreakCardSummary;
        milestone?: number | null;
      } = await response.json();
      if (!response.ok || !data.summary)
        throw new Error(data.error ?? "Could not save. Try again.");
      releaseRefresh.current = release;
      setOpen(false);
      const next = data.summary;
      toast.add({
        title:
          body.action === "slip"
            ? "Slip logged. Your next clean day starts now."
            : body.action === "clean"
              ? `Yesterday counted. ${daysLabel(next.current)} clean.`
              : `Logged. ${next.current} ${countLabel("BUILD", next.current)}.`,
        type: body.action === "slip" ? "info" : "success",
      });
      if (data.milestone)
        celebrateStreak({
          emoji: streak.emoji,
          title: streak.title,
          kind: streak.kind,
          visibility: streak.visibility,
          milestone: data.milestone,
          stat:
            totalsParts(streak.kind, next.run, streak.unitLabel).join(", ") ||
            null,
        });
    } catch (cause) {
      release();
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not reach the server. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  function startSlip() {
    setCameFromConfirm(true);
    setError(null);
    // Answering "no" about yesterday most likely means yesterday evening.
    const evening = phoenixWallToDate(summary.yesterday, 21, 0, 0, 0);
    const value = evening ? phoenixLocalDateTimeValue(evening) : bounds.max;
    setWhen(
      value < bounds.min ? bounds.min : value > bounds.max ? bounds.max : value,
    );
    setMode("slip");
  }

  const units = parseUnitsInput(amount);
  const step = (direction: 1 | -1) => {
    const current = units ?? 0;
    const next = Math.max(
      100,
      Math.round(current / 100) * 100 + direction * 100,
    );
    setAmount(hundredthsToInput(next));
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) setOpen(false);
      }}
      onOpenChangeComplete={(next) => {
        if (next) return;
        releaseRefresh.current?.();
        onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={!pending}
        // Focus the main action, not the note, so phones don't open the keyboard.
        initialFocus={() =>
          body.current?.querySelector<HTMLElement>("[data-initial-focus]") ??
          true
        }
      >
        <div
          ref={body}
          className="mx-auto flex w-full max-w-lg flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle>
              {mode === "confirm"
                ? "Was yesterday clean?"
                : mode === "slip"
                  ? "Log a slip"
                  : `${streak.emoji} ${streak.title}`}
            </SheetTitle>
            <SheetDescription>
              {mode === "confirm" && actions.confirmDay
                ? `${streak.emoji} ${streak.title}, ${formatDayLong(actions.confirmDay)}`
                : mode === "slip"
                  ? "It happens. Logging it honestly keeps this streak real."
                  : loggedUnits && streak.unitLabel
                    ? `${day === summary.today ? "Today" : "Yesterday"} so far: ${formatStreakUnits(loggedUnits, streak.unitLabel)}.`
                    : summary.week.find((item) => item.day === day)?.state ===
                        "done"
                      ? `Already logged ${day === summary.today ? "today" : "yesterday"}. Log again to add more.`
                      : "Log it any time today. Yesterday stays open until midnight."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            {mode === "log" && actions.logDays.length > 1 && (
              <Field>
                <FieldLabel id={`${id}-day`}>Which day?</FieldLabel>
                <ToggleGroup
                  aria-labelledby={`${id}-day`}
                  value={[day]}
                  onValueChange={(value) => {
                    if (value[0]) setDay(String(value[0]));
                  }}
                  variant="outline"
                  spacing={2}
                  className="w-full"
                  disabled={pending}
                >
                  <ToggleGroupItem value={summary.today} className="flex-1">
                    Today
                  </ToggleGroupItem>
                  <ToggleGroupItem value={summary.yesterday} className="flex-1">
                    Yesterday
                    {summary.yesterdayState === "pending"
                      ? " (needs a log)"
                      : ""}
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
            )}
            <FieldGroup>
              {mode === "log" && streak.unitLabel && (
                <Field data-invalid={units === undefined || undefined}>
                  <FieldLabel htmlFor={`${id}-amount`}>
                    How many {streak.unitLabel}?
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`One less ${streak.unitLabel}`}
                      disabled={pending || (units ?? 0) <= 100}
                      onClick={() => step(-1)}
                    >
                      <Minus />
                    </Button>
                    <Input
                      id={`${id}-amount`}
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      className="text-center text-base tabular-nums"
                      aria-invalid={units === undefined || undefined}
                      disabled={pending}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`One more ${streak.unitLabel}`}
                      disabled={pending}
                      onClick={() => step(1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <FieldDescription>
                    Prefilled with your usual amount. Logs on the same day add
                    up.
                  </FieldDescription>
                </Field>
              )}
              {mode === "slip" && (
                <Field>
                  <FieldLabel htmlFor={`${id}-when`}>
                    When did it happen?
                  </FieldLabel>
                  <Input
                    id={`${id}-when`}
                    type="datetime-local"
                    value={when}
                    min={bounds.min}
                    max={bounds.max}
                    onChange={(event) => setWhen(event.target.value)}
                    disabled={pending}
                  />
                  <FieldDescription>
                    Phoenix time. Yesterday or today. Your count starts over,
                    but your history and all-time totals stay.
                  </FieldDescription>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor={`${id}-note`}>
                  {mode === "slip"
                    ? "What triggered it? (optional)"
                    : "Add a note (optional)"}
                </FieldLabel>
                {mode === "slip" ? (
                  <Textarea
                    id={`${id}-note`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={280}
                    placeholder="Long day, coffee was right there."
                    disabled={pending}
                  />
                ) : (
                  <Input
                    id={`${id}-note`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={280}
                    placeholder={
                      quit
                        ? "Rough afternoon, but I held on."
                        : "Finished chapter four."
                    }
                    disabled={pending}
                  />
                )}
              </Field>
            </FieldGroup>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {mode === "confirm" && actions.confirmDay && (
              <div className="flex flex-col gap-2">
                <HoldButton
                  className="w-full"
                  disabled={pending}
                  onConfirm={() =>
                    void submit({
                      action: "clean",
                      day: actions.confirmDay,
                      note,
                    })
                  }
                >
                  {pending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Check data-icon="inline-start" />
                  )}
                  Hold: still clean
                </HoldButton>
                <Button variant="ghost" disabled={pending} onClick={startSlip}>
                  No, I slipped
                </Button>
              </div>
            )}
            {mode === "log" && (
              <HoldButton
                className="w-full"
                disabled={pending || units === undefined}
                onConfirm={() =>
                  void submit({
                    action: "log",
                    day,
                    units: streak.unitLabel ? (units ?? null) : null,
                    note,
                  })
                }
              >
                {pending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                Hold: did it
              </HoldButton>
            )}
            {mode === "slip" && (
              <div className="flex gap-2">
                {cameFromConfirm && (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={pending}
                    onClick={() => {
                      setMode("confirm");
                      setError(null);
                    }}
                  >
                    <ArrowLeft data-icon="inline-start" />
                    Back
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="lg"
                  className="flex-1"
                  data-initial-focus
                  disabled={pending || !parsePhoenixLocalDateTime(when)}
                  onClick={() =>
                    void submit({ action: "slip", occurredAt: when, note })
                  }
                >
                  {pending && <Spinner data-icon="inline-start" />}
                  Log slip
                </Button>
              </div>
            )}
            {mode !== "slip" && (
              <p className="text-center text-xs text-muted-foreground">
                Press and hold to confirm.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
