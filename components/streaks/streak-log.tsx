"use client";

import { Check, Minus, Plus } from "lucide-react";
import { type ComponentProps, useId, useRef, useState } from "react";
import { celebrateStreak } from "@/components/streaks/streak-celebration";
import { countLabel, totalsParts } from "@/components/streaks/streak-text";
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
  parsePhoenixLocalDateTime,
  phoenixLocalDateTimeValue,
} from "@/lib/time";

function logButtonLabel(streak: StreakView) {
  if (streak.kind === "QUIT") return "Log a slip";
  if (streak.summary.todayState === "off") return "Log yesterday";
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
  const quiet = streak.kind === "QUIT";
  const label = logButtonLabel(streak);
  if (!actions.canSlip && !actions.logDays.length) return null;
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
  const mode = quit ? "slip" : "log";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [day, setDay] = useState(actions.logDays[0] ?? summary.today);
  const [amount, setAmount] = useState(hundredthsToInput(streak.dailyUnits));
  const [bounds] = useState(() => {
    const range = slipWindow(streak.startedAt);
    return {
      min: phoenixLocalDateTimeValue(range.min),
      max: phoenixLocalDateTimeValue(range.max),
    };
  });
  const [when, setWhen] = useState(() =>
    summary.todayState === "off" ? `${summary.yesterday}T21:00` : bounds.max,
  );
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
            ? "Slip logged. Your streak has been recalculated."
            : `Logged. ${next.current} ${countLabel("BUILD", next.current)}.`,
        type: body.action === "slip" ? "info" : "success",
      });
      if (data.milestone)
        celebrateStreak({
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
              {mode === "slip" ? "Log a slip" : streak.title}
            </SheetTitle>
            <SheetDescription>
              {mode === "slip"
                ? "Your streak recalculates from the time of the slip."
                : loggedUnits && streak.unitLabel
                  ? `${day === summary.today ? "Today" : "Yesterday"} so far: ${formatStreakUnits(loggedUnits, streak.unitLabel)}.`
                  : summary.week.find((item) => item.day === day)?.state ===
                      "done"
                    ? `Already logged ${day === summary.today ? "today" : "yesterday"}. Log again to add more.`
                    : "Days count when you log them. You can also log yesterday."}
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
                    {summary.yesterdayState === "missed" ? " (not logged)" : ""}
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
                    Phoenix time. Yesterday or today. Your count and totals
                    adjust to the day of the slip.
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
            {mode === "log" && (
              <Button
                type="button"
                size="lg"
                className="w-full"
                data-initial-focus
                disabled={pending || units === undefined}
                onClick={() =>
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
                Did it
              </Button>
            )}
            {mode === "slip" && (
              <div className="flex gap-2">
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
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
