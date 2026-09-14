import { parsePhoenixLocalDateTime } from "@/lib/time";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import { shiftDateKey } from "@/lib/timeblocks";

export function blockDuration(startedAt: string, completedAt: string) {
  const start = parsePhoenixLocalDateTime(startedAt);
  const end = parsePhoenixLocalDateTime(completedAt);
  if (!start || !end || end <= start) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const hours = Math.floor(minutes / 60);
  return [hours ? `${hours}h` : "", minutes % 60 ? `${minutes % 60}m` : ""]
    .filter(Boolean)
    .join(" ");
}

/** Split overnight blocks and share width only within each overlapping group. */
export function calendarDaySegments(rows: TimeblockDraftRow[], day: string) {
  const start = `${day}T00:00`;
  const end = `${shiftDateKey(day, 1)}T00:00`;
  const minute = (value: string) =>
    Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  const segments = rows
    .filter(
      (row) =>
        row.included &&
        parsePhoenixLocalDateTime(row.startedAt) &&
        parsePhoenixLocalDateTime(row.completedAt) &&
        row.startedAt < row.completedAt &&
        row.startedAt < end &&
        row.completedAt > start,
    )
    .map((row) => ({
      row,
      start: row.startedAt < start ? 0 : minute(row.startedAt),
      end: row.completedAt >= end ? 1440 : minute(row.completedAt),
      lane: 0,
      lanes: 1,
    }))
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
