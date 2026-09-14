import { CalendarRange } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import {
  TimeblockBuilder,
  type TimeblockBuilderRow,
} from "@/components/timeblocks/timeblock-builder";
import { TimeblockNav } from "@/components/timeblocks/timeblock-nav";
import { Badge } from "@/components/ui/badge";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import {
  formatDayLong,
  formatDayShort,
  parseDateKey,
  phoenixDateKey,
  phoenixLocalDateTimeValue,
} from "@/lib/time";
import { parseTimeblockRoutine } from "@/lib/timeblock-routine";
import {
  isMondayDateKey,
  nextOrSameMonday,
  timeblockWeek,
} from "@/lib/timeblocks";

export const metadata: Metadata = { title: "Timeblock" };

export default async function TimeblockPage({
  searchParams,
}: {
  searchParams: Promise<{ due?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const latestDueMonday = nextOrSameMonday(phoenixDateKey());
  const params = await searchParams;
  const requestedDue = params.due ?? latestDueMonday;
  const dueMonday =
    parseDateKey(requestedDue) &&
    isMondayDateKey(requestedDue) &&
    requestedDue <= latestDueMonday
      ? requestedDue
      : latestDueMonday;
  const week = timeblockWeek(dueMonday);
  const user = await getPrisma().user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { timeblockRoutine: true },
  });

  const proofs = await getPrisma().taskProof.findMany({
    where: {
      ownerId: session.user.id,
      circleId: membership.circleId,
      replacedById: null,
      startedAt: { lt: week.endAtExclusive },
      completedAt: { gt: week.startAt },
    },
    orderBy: { completedAt: "asc" },
    take: 56,
    include: {
      commitment: { select: { title: true, status: true } },
    },
  });

  const rows: TimeblockBuilderRow[] = proofs.map((proof) => ({
    id: proof.commitmentId,
    title: proof.commitment.title,
    startedAt: phoenixLocalDateTimeValue(proof.startedAt),
    completedAt: phoenixLocalDateTimeValue(proof.completedAt),
    status: proof.commitment.status,
    included: true,
  }));

  return (
    <>
      <PageHeader
        title="Timeblock"
        description={`Your printable report for Ms. Merrill, ${formatDayShort(week.startKey)} through ${formatDayShort(week.endKey)}. School, sleep, and work in one schedule.`}
        actions={
          <TimeblockNav
            dueMonday={dueMonday}
            latestDueMonday={latestDueMonday}
          />
        }
      >
        <Badge variant="secondary">
          <CalendarRange />
          Due {formatDayLong(dueMonday)}
        </Badge>
      </PageHeader>
      <TimeblockBuilder
        key={`${membership.circleId}:${dueMonday}`}
        dueMonday={dueMonday}
        draftKey={`pb-timeblock:${session.user.id}:${membership.circleId}:${dueMonday}`}
        weekEnd={week.endKey}
        initialRows={rows}
        initialRoutine={parseTimeblockRoutine(user.timeblockRoutine)}
      />
    </>
  );
}
