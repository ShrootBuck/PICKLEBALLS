"use client";

import { CalendarDays, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  EVERY_DAY,
  scheduleLabel,
  WEEKDAY_NAMES,
  WEEKDAYS,
} from "@/lib/streak-policy";

export function StreakSchedulePicker({
  value,
  onChange,
  disabled,
  editing,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  disabled: boolean;
  editing: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const preset =
    value.length === 7
      ? "daily"
      : value.join() === WEEKDAYS.join()
        ? "weekdays"
        : "custom";
  const [custom, setCustom] = useState(preset === "custom");
  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={disabled}
        aria-expanded={expanded}
        aria-controls={`${id}-schedule`}
        onClick={() => setExpanded(!expanded)}
      >
        <CalendarDays data-icon="inline-start" />
        {scheduleLabel(value)}
        <ChevronDown data-icon="inline-end" />
      </Button>
      {expanded && (
        <Field id={`${id}-schedule`}>
          <FieldLabel id={`${id}-label`}>Which days count?</FieldLabel>
          <ToggleGroup
            aria-labelledby={`${id}-label`}
            value={[custom ? "custom" : preset]}
            variant="outline"
            className="w-full"
            disabled={disabled}
            onValueChange={(values) => {
              const next = values[0];
              if (!next) return;
              setCustom(next === "custom");
              if (next === "daily") onChange([...EVERY_DAY]);
              if (next === "weekdays") onChange([...WEEKDAYS]);
            }}
          >
            <ToggleGroupItem value="daily" className="flex-1">
              Every day
            </ToggleGroupItem>
            <ToggleGroupItem value="weekdays" className="flex-1">
              Weekdays
            </ToggleGroupItem>
            <ToggleGroupItem value="custom" className="flex-1">
              Custom
            </ToggleGroupItem>
          </ToggleGroup>
          {custom && (
            <ToggleGroup
              multiple
              aria-label="Scheduled days"
              value={value.map(String)}
              variant="outline"
              spacing={1}
              className="w-full"
              disabled={disabled}
              onValueChange={(values) => {
                if (values.length)
                  onChange(values.map(Number).sort((a, b) => a - b));
              }}
            >
              {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                <ToggleGroupItem
                  key={day}
                  value={String(day)}
                  aria-label={WEEKDAY_NAMES[day]}
                  className="min-w-0 flex-1 px-0"
                >
                  {WEEKDAY_NAMES[day].slice(0, 2)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <FieldDescription>
            Off days keep your streak without adding to it.
            {editing ? " Schedule changes start tomorrow." : ""}
          </FieldDescription>
        </Field>
      )}
    </div>
  );
}
