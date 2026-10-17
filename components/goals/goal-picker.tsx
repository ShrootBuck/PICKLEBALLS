"use client";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { refreshEvent } from "@/lib/app-refresh";
import { watchRealtime } from "@/lib/watch-realtime";

export function GoalPicker({
  circleId,
  value,
  onChange,
  disabled,
  initial,
}: {
  circleId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  initial?: { id: string; title: string };
}) {
  const id = useId();
  const [goals, setGoals] = useState<{ id: string; title: string }[]>(
    initial ? [initial] : [],
  );
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries a failed request.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const live = watchRealtime(
      async () => {
        try {
          const response = await fetch("/api/goals", {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20_000),
            ]),
          });
          const result = await response.json();
          if (!response.ok || result.circleId !== circleId)
            throw new Error("Goals unavailable");
          if (!controller.signal.aborted) {
            setGoals(result.goals);
            setFailed(false);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setFailed(true);
            throw error;
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      (event) => event.type === "refresh",
      [refreshEvent],
    );
    return () => {
      controller.abort();
      live.dispose();
    };
  }, [circleId, attempt]);
  const items = [
    { value: "", label: "No goal" },
    ...goals.map((goal) => ({ value: goal.id, label: goal.title })),
  ];
  return (
    <Field data-disabled={disabled || loading}>
      <FieldLabel htmlFor={id}>Goal (optional)</FieldLabel>
      <Select
        items={items}
        value={value ?? ""}
        onValueChange={(next) => onChange(next || null)}
        disabled={disabled || loading}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {failed ? (
        <FieldDescription>
          Couldn't load your goals.{" "}
          <Button
            variant="link"
            size="sm"
            disabled={disabled}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </Button>
        </FieldDescription>
      ) : loading ? (
        <FieldDescription>Loading your goals...</FieldDescription>
      ) : null}
    </Field>
  );
}
