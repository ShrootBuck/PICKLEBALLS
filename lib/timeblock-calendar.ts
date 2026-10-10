import { parsePhoenixLocalDateTime } from "@/lib/time";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import { shiftDateKey } from "@/lib/timeblocks";

export function blockDuration(startedAt: string, completedAt: string) {
  const start = parsePhoenixLocalDateTime(startedAt);
  const end = parsePhoenixLocalDateTime(completedAt);
  if (!start || !end || end <= start) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (minutes === 0) return "<1m";
  const hours = Math.floor(minutes / 60);
  return [hours ? `${hours}h` : "", minutes % 60 ? `${minutes % 60}m` : ""]
    .filter(Boolean)
    .join(" ");
}

/** Split overnight blocks and share width only within each overlapping group. */
export function calendarDaySegments(rows: TimeblockDraftRow[], day: string) {
  const start = parsePhoenixLocalDateTime(`${day}T00:00`)?.getTime();
  const end = parsePhoenixLocalDateTime(
    `${shiftDateKey(day, 1)}T00:00`,
  )?.getTime();
  if (start == null || end == null) return [];
  const segments = rows
    .flatMap((row) => {
      const from = parsePhoenixLocalDateTime(row.startedAt)?.getTime();
      const to = parsePhoenixLocalDateTime(row.completedAt)?.getTime();
      if (
        !row.included ||
        from == null ||
        to == null ||
        to <= from ||
        from >= end ||
        to <= start
      )
        return [];
      return [
        {
          row,
          start: (Math.max(start, from) - start) / 60_000,
          end: (Math.min(end, to) - start) / 60_000,
          lane: 0,
          lanes: 1,
        },
      ];
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let groupStart = 0;
  let groupEnd = -1;
  let laneEnds: number[] = [];
  function finishGroup(endIndex: number) {
    for (let i = groupStart; i < endIndex; i++)
      segments[i].lanes = laneEnds.length;
  }
  segments.forEach((segment, index) => {
    if (segment.start >= groupEnd) {
      finishGroup(index);
      groupStart = index;
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= segment.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = segment.end;
    segment.lane = lane;
    groupEnd = Math.max(groupEnd, segment.end);
  });
  finishGroup(segments.length);
  return segments;
}
