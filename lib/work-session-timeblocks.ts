import {
  phoenixDateKey,
  phoenixLocalDateTimeValue,
  phoenixWallToDate,
} from "@/lib/time";
import type { TimeblockDraftRow } from "@/lib/timeblock-draft";
import { shiftDateKey, timeblockWeek } from "@/lib/timeblocks";

type RecordedSession = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  updatedAt: Date;
  commitment: { title: string; status: TimeblockDraftRow["status"] };
};

// Split at Phoenix midnight and clip to the requested report week. Preserve
// sub-minute intervals, including sessions stopped immediately after starting.
export function workSessionTimeblocks(
  sessions: RecordedSession[],
  dueMonday: string,
): TimeblockDraftRow[] {
  const week = timeblockWeek(dueMonday);
  return sessions.flatMap((session) => {
    if (!session.endedAt) return [];
    const rows: TimeblockDraftRow[] = [];
    const end = Math.min(
      session.endedAt.getTime(),
      week.endAtExclusive.getTime(),
    );
    let cursor = Math.max(session.startedAt.getTime(), week.startAt.getTime());
    while (cursor < end) {
      const day = phoenixDateKey(new Date(cursor));
      const midnight = phoenixWallToDate(shiftDateKey(day, 1), 0, 0, 0, 0);
      if (!midnight) break;
      const finish = Math.min(end, midnight.getTime());
      rows.push({
        id: `session-${session.id}-${day}`,
        sessionId: session.id,
        sourceUpdatedAt: session.updatedAt.toISOString(),
        title: session.commitment.title,
        status: session.commitment.status,
        startedAt: phoenixLocalDateTimeValue(new Date(cursor), true),
        completedAt: phoenixLocalDateTimeValue(new Date(finish), true),
        included: true,
      });
      cursor = finish;
    }
    return rows;
  });
}
