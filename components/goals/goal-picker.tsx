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
    fetch("/api/goals", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result.circleId !== circleId)
          throw new Error("Goals unavailable");
        setGoals(result.goals);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
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
      ) : (
        <FieldDescription>
          {loading
            ? "Loading your goals..."
            : "Connect today's task to something bigger."}
        </FieldDescription>
      )}
    </Field>
  );
}
