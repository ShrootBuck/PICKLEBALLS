"use client";

import { CalendarIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseDateKeyLocal(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function formatDateKey(value: string): string {
  if (!value) return "";
  const d = parseDateKeyLocal(value);
  if (!d) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(d);
}

export function DatePicker({
  id,
  value,
  onChange,
  label,
  required,
  placeholder = "Pick a date",
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const selected = parseDateKeyLocal(value);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <Label htmlFor={inputId} className="text-sm font-medium">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              id={inputId}
              variant="outline"
              disabled={disabled}
              aria-required={required}
              className={cn(
                "h-11 justify-between font-normal touch-manipulation md:h-8",
                !value && "text-muted-foreground",
              )}
            />
          }
        >
          <span className="truncate">
            {value ? formatDateKey(value) : placeholder}
          </span>
          <CalendarIcon data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 max-w-[calc(100vw-2rem)]"
          align="start"
        >
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) return;
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, "0");
              const d = String(date.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${d}`);
            }}
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
      {/* hidden input to participate in forms if needed */}
      <input type="hidden" value={value} readOnly aria-hidden="true" />
    </div>
  );
}

export function DateInput({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  return <DatePicker value={value} onChange={onChange} {...props} />;
}
