import type { Metadata } from "next";
import { TodayDashboard } from "@/components/today/today-dashboard";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { reconcileMissedTasks } from "@/lib/tasks";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const { session, membership } = await requirePageMembership();
  const dayKey = phoenixDateKey();
  const day = requireDateKey(dayKey);
  await reconcileMissedTasks(membership.circleId);
  const [tasks, checkIn] = await Promise.all([
    getPrisma().commitment.findMany({
      where: { userId: session.user.id, circleId: membership.circleId, day },
      orderBy: { dueAt: "asc" },
      include: {
        proofs: {
          where: { replacedById: null },
          orderBy: { submittedAt: "desc" },
          take: 1,
        },
      },
    }),
    getPrisma().checkIn.findUnique({
      where: {
        userId_circleId_day: {
          userId: session.user.id,
          circleId: membership.circleId,
          day,
        },
      },
    }),
  ]);
  return (
    <TodayDashboard
      day={dayKey}
      tasks={tasks.map((task) => ({
        id: task.id,
        day: task.day.toISOString().slice(0, 10),
        title: task.title,
        definitionOfDone: task.definitionOfDone,
        dueAt: task.dueAt.toISOString(),
        status: task.status,
        proof: task.proofs[0]
          ? {
              id: task.proofs[0].id,
              isLate: task.proofs[0].isLate,
              reviewStatus: task.proofs[0].reviewStatus,
              aiStatus: task.proofs[0].aiStatus,
            }
          : null,
      }))}
      checkIn={
        checkIn ? { signal: checkIn.signal, blocker: checkIn.blocker } : null
      }
    />
  );
}
