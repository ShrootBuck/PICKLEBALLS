"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDayShort, parsePhoenixLocalDateTime } from "@/lib/time";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
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
}: {
  rows: TimeblockDraftRow[];
  weekStart: string;
  overlaps: Set<string>;
  onSelect: (row: TimeblockDraftRow) => void;
  onAdd: (day: string) => void;
  disabled: boolean;
}) {
  const days = Array.from({ length: 7 }, (_, i) => shiftDateKey(weekStart, i));
  const valid = rows.filter(
    (r) =>
      r.included &&
      parsePhoenixLocalDateTime(r.startedAt) &&
      parsePhoenixLocalDateTime(r.completedAt) &&
      r.startedAt < r.completedAt,
  );
  const segments = days.map((day) => {
    const start = `${day}T00:00`;
    const end = `${shiftDateKey(day, 1)}T00:00`;
    return valid
      .filter((r) => r.startedAt < end && r.completedAt > start)
      .map((row) => ({
        row,
        start:
          row.startedAt < start
            ? 0
            : Number(row.startedAt.slice(11, 13)) * 60 +
              Number(row.startedAt.slice(14, 16)),
        end:
          row.completedAt >= end
            ? 1440
            : Number(row.completedAt.slice(11, 13)) * 60 +
              Number(row.completedAt.slice(14, 16)),
        lane: 0,
      }))
      .sort((a, b) => a.start - b.start || b.end - a.end);
  });
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
  return (
    <section
      className="timeblock-calendar-scroll"
      aria-label="Weekly timeblock calendar, scroll horizontally to see all days"
    >
      <div className="timeblock-calendar">
        <div className="timeblock-calendar-corner">PHX</div>
        {days.map((day) => (
          <div className="timeblock-day-heading" key={day}>
            <span>{formatDayShort(day)}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Add block on ${formatDayShort(day)}`}
              disabled={disabled}
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
          const laneEnds: number[] = [];
          const positioned = daySegments.map((segment) => {
            let lane = laneEnds.findIndex((end) => end <= segment.start);
            if (lane < 0) lane = laneEnds.length;
            laneEnds[lane] = segment.end;
            return { ...segment, lane };
          });
          const lanes = Math.max(1, laneEnds.length);
          return (
            <div
              key={days[dayIndex]}
              className="timeblock-day-column"
              style={{ height }}
            >
              {positioned.map(({ row, start, end, lane }) => (
                <Button
                  variant="plain"
                  key={row.id}
                  type="button"
                  className="timeblock-calendar-block"
                  data-proof={row.status !== null || undefined}
                  data-overlap={overlaps.has(row.id) || undefined}
                  onClick={() => onSelect(row)}
                  aria-label={`Edit ${row.title || "Untitled block"}, ${formatDayShort(days[dayIndex])}, ${blockTime(row.startedAt)} to ${blockTime(row.completedAt)}${overlaps.has(row.id) ? ", overlaps another block" : ""}`}
                  style={{
                    top: (start / 60 - firstHour) * 64 + 2,
                    height: Math.max(26, ((end - start) / 60) * 64 - 4),
                    left: `calc(${(lane / lanes) * 100}% + 3px)`,
                    width: `calc(${100 / lanes}% - 6px)`,
                  }}
                >
                  <strong>{row.title || "Untitled block"}</strong>
                  <span>{blockTime(row.startedAt)}</span>
                </Button>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
