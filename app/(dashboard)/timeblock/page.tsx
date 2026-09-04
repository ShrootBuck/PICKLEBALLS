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

  const proofs = await getPrisma().taskProof.findMany({
    where: {
      ownerId: session.user.id,
      circleId: membership.circleId,
      replacedById: null,
      completedAt: { gte: week.startAt, lt: week.endAtExclusive },
    },
    orderBy: { completedAt: "asc" },
    take: 56,
    include: {
      commitment: { select: { title: true, status: true } },
    },
  });

  const rows: TimeblockBuilderRow[] = proofs.map((proof) => ({
    id: proof.id,
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
        description={`Completed work from ${formatDayShort(week.startKey)} through ${formatDayShort(week.endKey)}. Proof uploads fill this in automatically.`}
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
        key={dueMonday}
        dueMonday={dueMonday}
        weekEnd={week.endKey}
        initialRows={rows}
      />
    </>
  );
}
