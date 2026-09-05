import type { Metadata } from "next";
import { headers } from "next/headers";
import { LandingPage } from "@/components/landing/landing-page";
import { TodayDashboard } from "@/components/today/today-dashboard";
import { auth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return { title: { absolute: "Pickle Balls · Do the homework" } };
  }
  return { title: "Today" };
}

export default async function TodayPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <LandingPage />;
  const { membership } = await requirePageMembership();
  const dayKey = phoenixDateKey();
  const day = requireDateKey(dayKey);
  // Overdue marking is owned by the daily cron (`/api/cron/reconcile`), not
  // by page views — scanning on every visit just slows down Today.
  const [tasks, checkIn, history] = await Promise.all([
    getPrisma().commitment.findMany({
      where: {
        userId: session.user.id,
        circleId: membership.circleId,
        OR: [{ day }, { day: { lt: day }, status: { not: "VERIFIED" } }],
      },
      orderBy: [{ day: "desc" }, { createdAt: "asc" }],
      include: {
        proofs: {
          where: { replacedById: null },
          orderBy: { submittedAt: "desc" },
          take: 1,
          include: {
            reviews: {
              orderBy: { createdAt: "asc" },
              include: {
                reviewer: { select: { id: true, name: true } },
                replies: {
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                  take: 50,
                  include: {
                    author: {
                      select: {
                        id: true,
                        name: true,
                        image: true,
                        initials: true,
                      },
                    },
                  },
                },
              },
            },
          },
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
    getPrisma().checkInUpdate.findMany({
      where: {
        userId: session.user.id,
        circleId: membership.circleId,
        day,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  // Old check-ins from before history existed still show up once.
  const historyItems =
    history.length === 0 && checkIn
      ? [
          {
            id: checkIn.id,
            signal: checkIn.signal,
            blocker: checkIn.blocker,
            createdAt: checkIn.updatedAt.toISOString(),
          },
        ]
      : history.map((item) => ({
          id: item.id,
          signal: item.signal,
          blocker: item.blocker,
          createdAt: item.createdAt.toISOString(),
        }));
  return (
    <TodayDashboard
      key={`${membership.circleId}:${dayKey}`}
      day={dayKey}
      currentUserId={session.user.id}
      tasks={tasks.map((task) => ({
        id: task.id,
        day: task.day.toISOString().slice(0, 10),
        title: task.title,
        definitionOfDone: task.definitionOfDone,
        dueAt: task.dueAt.toISOString(),
        status:
          task.proofs.length === 0 &&
          task.dueAt < new Date() &&
          (task.status === "OPEN" || task.status === "RENEGOTIATED")
            ? "MISSED"
            : task.status,
        proof: task.proofs[0]
          ? {
              id: task.proofs[0].id,
              isLate: task.proofs[0].isLate,
              ownerNote: task.proofs[0].ownerNote,
              reviewStatus: task.proofs[0].reviewStatus,
              aiStatus: task.proofs[0].aiStatus,
              reviews: task.proofs[0].reviews.map((review) => ({
                id: review.id,
                decision: review.decision,
                note: review.note,
                createdAt: review.createdAt.toISOString(),
                reviewerName: review.reviewer.name,
                reviewerId: review.reviewer.id,
                replies: review.replies.map((reply) => ({
                  id: reply.id,
                  body: reply.body,
                  createdAt: reply.createdAt.toISOString(),
                  updatedAt: reply.updatedAt.toISOString(),
                  author: reply.author,
                })),
              })),
            }
          : null,
      }))}
      checkIn={
        checkIn ? { signal: checkIn.signal, blocker: checkIn.blocker } : null
      }
      checkInHistory={historyItems}
    />
  );
}
