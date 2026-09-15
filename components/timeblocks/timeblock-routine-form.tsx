"use client";

import { ChevronDown, Moon, School } from "lucide-react";
import { useEffect, useState } from "react";
import { blockTime } from "@/components/timeblocks/timeblock-calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  SCHOOL_PERIODS,
  type TimeblockRoutine,
  timeblockRoutineSchema,
} from "@/lib/timeblock-routine";

import { cn } from "@/lib/utils";

export function TimeblockRoutineForm({
  routine,
  onSave,
  disabled,
  saveStatus,
  onRetry,
  onDirtyChange,
  focusRequest,
}: {
  routine: TimeblockRoutine;
  onSave: (routine: TimeblockRoutine) => void;
  disabled: boolean;
  saveStatus: "saved" | "saving" | "error";
  onRetry: () => void;
  onDirtyChange: (dirty: boolean) => void;
  focusRequest: { id: string } | null;
}) {
  const [open, setOpen] = useState(
    !routine.sleep || Object.values(routine.classes).some((name) => !name),
  );
  useEffect(() => {
    if (focusRequest) setOpen(true);
  }, [focusRequest]);
  useEffect(() => {
    if (open && focusRequest) {
      const field = document.getElementById(focusRequest.id);
      field?.focus({ preventScroll: true });
      field?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [open, focusRequest]);
  const [draft, setDraft] = useState(routine);
  const [bedtime, setBedtime] = useState(routine.sleep?.bedtime ?? "");
  const [wakeTime, setWakeTime] = useState(routine.sleep?.wakeTime ?? "");
  const [error, setError] = useState<string | null>(null);
  const changed =
    JSON.stringify({
      ...draft,
      sleep: bedtime || wakeTime ? { bedtime, wakeTime } : null,
    }) !== JSON.stringify(routine);
  useEffect(() => {
    onDirtyChange(changed);
  }, [changed, onDirtyChange]);
  return (
    <Card
      id="timeblock-routine"
      className={cn(!open && "has-data-[slot=card-footer]:pb-5")}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Weekly routine</CardTitle>
              <CardDescription>
                Your recurring routine, saved across weeks.
              </CardDescription>
            </div>
            <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
              {open ? "Hide settings" : "Edit routine"}
              <ChevronDown
                data-icon="inline-end"
                className={cn(open && "rotate-180")}
              />
            </CollapsibleTrigger>
          </div>
          <div className="flex flex-wrap gap-2 pt-2" aria-live="polite">
            <Badge variant="secondary">
              <School />
              {routine.schedule != null
                ? "Custom weekly schedule"
                : "Monday to Friday"}
            </Badge>
            <Badge variant="outline">
              <Moon />
              {routine.sleep
                ? `${blockTime(`2000-01-01T${routine.sleep.bedtime}`)} to ${blockTime(`2000-01-01T${routine.sleep.wakeTime}`)}`
                : "Sleep not set"}
            </Badge>
            {changed && <Badge variant="outline">Unapplied changes</Badge>}
            {saveStatus === "error" && (
              <Badge variant="destructive">Not saved to account</Badge>
            )}
          </div>
        </CardHeader>
        <CollapsibleContent keepMounted>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = new FormData(event.currentTarget);
              const submittedBedtime = String(values.get("bedtime") ?? "");
              const submittedWake = String(values.get("wakeTime") ?? "");
              const parsed = timeblockRoutineSchema.safeParse({
                ...draft,
                sleep:
                  submittedBedtime || submittedWake
                    ? { bedtime: submittedBedtime, wakeTime: submittedWake }
                    : null,
              });
              if (!parsed.success) {
                setError(
                  "Enter both sleep times, with a different bedtime and wake time, or leave both empty.",
                );
                return;
              }
              setError(null);
              onSave(parsed.data);
            }}
            className="flex flex-col gap-5 pt-5"
          >
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="outline">
                  {draft.listOrder === "category"
                    ? "Tasks grouped by category"
                    : "Tasks in time order"}
                </Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      listOrder:
                        draft.listOrder === "category" ? "time" : "category",
                    })
                  }
                >
                  {draft.listOrder === "category"
                    ? "Use time order"
                    : "Group by category"}
                </Button>
              </div>
              {draft.schedule != null && (
                <div
                  id="custom-routine"
                  tabIndex={-1}
                  className="flex flex-col gap-3"
                >
                  <p className="text-sm text-muted-foreground">
                    Your custom routine replaces the default school periods. Ask
                    the AI editor to change any activity, time, or day.
                  </p>
                  {draft.schedule.map((block) => (
                    <p key={block.id} className="text-sm">
                      <strong>{block.title}</strong>:{" "}
                      {block.days
                        .map(
                          (day) =>
                            ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
                              day
                            ],
                        )
                        .join(", ")}
                      , {blockTime(`2000-01-01T${block.start}`)} to{" "}
                      {blockTime(`2000-01-01T${block.end}`)}
                      {block.end < block.start ? " (next day)" : ""}
                    </p>
                  ))}
                  {draft.schedule.length === 0 && (
                    <p>No recurring school blocks.</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => setDraft({ ...draft, schedule: null })}
                  >
                    Restore default school periods
                  </Button>
                </div>
              )}
              {draft.schedule == null && (
                <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {SCHOOL_PERIODS.map(({ period, start, end }) => (
                    <Field key={period}>
                      <FieldLabel htmlFor={`period-${period}`}>
                        Period {period}
                        {period === "4" ? " · Lunch" : ""}
                      </FieldLabel>
                      <Input
                        id={`period-${period}`}
                        value={period === "4" ? "Lunch" : draft.classes[period]}
                        readOnly={period === "4"}
                        disabled={disabled}
                        maxLength={160}
                        placeholder="Class name"
                        onChange={(event) => {
                          if (period !== "4")
                            setDraft({
                              ...draft,
                              classes: {
                                ...draft.classes,
                                [period]: event.target.value,
                              },
                            });
                        }}
                      />
                      <FieldDescription>
                        {blockTime(`2000-01-01T${start}`)} to{" "}
                        {blockTime(`2000-01-01T${end}`)}
                      </FieldDescription>
                    </Field>
                  ))}
                </FieldGroup>
              )}
              <FieldGroup className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!error}>
                  <FieldLabel htmlFor="sleep-bedtime">Bedtime</FieldLabel>
                  <Input
                    id="sleep-bedtime"
                    name="bedtime"
                    type="time"
                    value={bedtime}
                    disabled={disabled}
                    aria-invalid={!!error}
                    onChange={(event) => setBedtime(event.target.value)}
                    onInput={(event) => setBedtime(event.currentTarget.value)}
                  />
                </Field>
                <Field data-invalid={!!error}>
                  <FieldLabel htmlFor="sleep-wake">Wake time</FieldLabel>
                  <Input
                    id="sleep-wake"
                    name="wakeTime"
                    type="time"
                    value={wakeTime}
                    disabled={disabled}
                    aria-invalid={!!error}
                    onChange={(event) => setWakeTime(event.target.value)}
                    onInput={(event) => setWakeTime(event.currentTarget.value)}
                  />
                </Field>
              </FieldGroup>
              {!routine.sleep && (
                <p className="text-sm text-muted-foreground">
                  Set your sleep times to include sleep in the PDF.
                </p>
              )}
              {error && (
                <Alert variant="destructive">
                  <AlertTitle>Check sleep times</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {saveStatus === "error" && (
                <Alert variant="destructive">
                  <AlertTitle>
                    Settings have not saved to your account
                  </AlertTitle>
                  <AlertDescription>
                    Your current calendar and PDF still include them.{" "}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onRetry}
                    >
                      Retry saving
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
            <CardFooter className="flex-wrap justify-between gap-3">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {changed
                  ? "Apply your changes before exporting."
                  : saveStatus === "saving"
                    ? "Saving to your account…"
                    : saveStatus === "saved"
                      ? "Routine settings apply to all weeks."
                      : "Keep this tab open until settings save."}
              </p>
              <Button type="submit" disabled={disabled || !changed}>
                Apply routine
              </Button>
            </CardFooter>
          </form>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
