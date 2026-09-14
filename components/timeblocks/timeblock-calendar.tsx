"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { formatDayShort } from "@/lib/time";
import { calendarDaySegments } from "@/lib/timeblock-calendar";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import { isRoutineBlock } from "@/lib/timeblock-routine";
import { shiftDateKey } from "@/lib/timeblocks";

export function blockTime(value: string) {
  const hour = Number(value.slice(11, 13));
  return `${hour % 12 || 12}:${value.slice(14, 16)} ${hour < 12 ? "AM" : "PM"}`;
}

export function TimeblockCalendar({
  rows,
  weekStart,
  overlaps,
  onSelect,
  onAdd,
  disabled,
  addDisabled,
}: {
  rows: TimeblockDraftRow[];
  weekStart: string;
  overlaps: Set<string>;
  onSelect: (row: TimeblockDraftRow) => void;
  onAdd: (day: string) => void;
  disabled: boolean;
  addDisabled: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(weekStart, i));
  const segments = days.map((day) => calendarDaySegments(rows, day));
  const allSegments = segments.flat();
  const firstHour = allSegments.length
    ? Math.max(
        0,
        Math.min(...allSegments.map((s) => Math.floor(s.start / 60))) - 1,
      )
    : 8;
  const lastHour = allSegments.length
    ? Math.min(
        24,
        Math.max(
          firstHour + 6,
          ...allSegments.map((s) => Math.ceil(s.end / 60) + 1),
        ),
      )
    : 20;
  const hours = Array.from(
    { length: lastHour - firstHour },
    (_, i) => firstHour + i,
  );
  const height = hours.length * 64;
  const scrollRef = useRef<HTMLElement>(null);
  const scrolledInitially = useRef(false);
  useEffect(() => {
    // Keep overnight sleep visible, but open the calendar around the school day.
    if (disabled || scrolledInitially.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = Math.max(0, (7 - firstHour) * 64);
    scrolledInitially.current = true;
  }, [disabled, firstHour]);
  return (
    <section
      ref={scrollRef}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll this calendar.
      tabIndex={0}
      className="timeblock-calendar-scroll"
      aria-label="Weekly timeblock calendar, scroll horizontally to see all days"
    >
      <div className="timeblock-calendar">
        <div className="timeblock-calendar-corner" title="Phoenix time (UTC−7)">
          PHX
        </div>
        {days.map((day) => (
          <div className="timeblock-day-heading" key={day}>
            <span>{formatDayShort(day)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Add block on ${formatDayShort(day)}`}
              disabled={disabled || addDisabled}
              onClick={() => onAdd(day)}
            >
              <Plus />
            </Button>
          </div>
        ))}
        <div className="timeblock-hours" style={{ height }}>
          {hours.map((hour) => (
            <span key={hour} style={{ top: (hour - firstHour) * 64 }}>
              {hour % 12 || 12}
              <small>{hour < 12 ? "AM" : "PM"}</small>
            </span>
          ))}
        </div>
        {segments.map((daySegments, dayIndex) => {
          return (
            <div
              key={days[dayIndex]}
              className="timeblock-day-column"
              style={{ height }}
            >
              {daySegments.map(({ row, start, end, lane, lanes }) => (
                <Button
                  variant="plain"
                  key={row.id}
                  type="button"
                  className="timeblock-calendar-block"
                  disabled={disabled}
                  data-compact={end - start < 40 || undefined}
                  data-routine={isRoutineBlock(row.id) || undefined}
                  data-proof={row.status !== null || undefined}
                  data-overlap={overlaps.has(row.id) || undefined}
                  onClick={() => onSelect(row)}
                  title={`${row.title || "Untitled block"} · ${blockTime(row.startedAt)} to ${blockTime(row.completedAt)}`}
                  aria-label={`Edit ${row.title || "Untitled block"}, ${formatDayShort(days[dayIndex])}, ${blockTime(row.startedAt)} to ${blockTime(row.completedAt)}${overlaps.has(row.id) ? ", overlaps another block" : ""}`}
                  style={{
                    top: (start / 60 - firstHour) * 64 + 2,
                    height: Math.max(18, ((end - start) / 60) * 64 - 4),
                    left: `calc(${(lane / lanes) * 100}% + 3px)`,
                    width: `calc(${100 / lanes}% - 6px)`,
                  }}
                >
                  <strong>{row.title || "Untitled block"}</strong>
                  <span>
                    {start === 0 && row.startedAt.slice(0, 10) < days[dayIndex]
                      ? "Continued"
                      : blockTime(row.startedAt)}
                  </span>
                </Button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
