import { History } from "lucide-react";
import type { Metadata } from "next";
import { HistoryNav } from "@/components/history/history-nav";
import { PageHeader } from "@/components/layout/page-header";
import { ProofCard } from "@/components/squad/proof-card";
import {
  signalVariant,
  taskStatusLabel,
  taskStatusVariant,
  toProofCard,
} from "@/components/squad/proof-helpers";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { requiredApprovalsForCircle } from "@/lib/task-policy";
import {
  formatDayLong,
  parseDateKey,
  phoenixDateKey,
  requireDateKey,
} from "@/lib/time";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const todayKey = phoenixDateKey();
  const params = await searchParams;
  const rawDay = params.day ?? todayKey;
  // Clamp to real past days. Garbage or future input falls back to today.
  const dayKey = parseDateKey(rawDay) && rawDay <= todayKey ? rawDay : todayKey;
  const day = requireDateKey(dayKey);

  const [tasks, checkIn, updates, memberCount] = await Promise.all([
    getPrisma().commitment.findMany({
      where: { userId: session.user.id, circleId: membership.circleId, day },
      orderBy: { dueAt: "asc" },
      include: {
        proofs: {
          where: { replacedById: null },
          orderBy: { submittedAt: "desc" },
          take: 1,
          include: {
            owner: { select: { name: true } },
            commitment: { select: { title: true } },
            replies: {
              orderBy: { createdAt: "asc" },
              take: 50,
              include: {
                author: {
                  select: { id: true, name: true, image: true, initials: true },
                },
              },
            },
            reviews: {
              orderBy: { createdAt: "asc" },
              include: {
                reviewer: { select: { name: true } },
                replies: {
                  orderBy: { createdAt: "asc" },
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
      where: { userId: session.user.id, circleId: membership.circleId, day },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getPrisma().membership.count({ where: { circleId: membership.circleId } }),
  ]);

  const verified = tasks.filter((task) => task.status === "VERIFIED").length;
  const needed = requiredApprovalsForCircle(memberCount);
  const historyTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <>
      <PageHeader
        title="History"
        description={
          tasks.length === 0
            ? "Nothing locked in that day."
            : `${verified}/${tasks.length} verified that day. Receipts below.`
        }
        actions={<HistoryNav day={dayKey} today={todayKey} />}
      >
        <Badge variant="secondary">{formatDayLong(dayKey)}</Badge>
      </PageHeader>

      {tasks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>Quiet day</EmptyTitle>
            <EmptyDescription>
              No promises on the board. Either rest or bullshit — you decide
              which story to tell.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {tasks.map((task) => {
            const proof = task.proofs[0] ?? null;
            if (!proof) {
              return (
                <Card key={task.id} size="sm">
                  <CardHeader>
                    <CardTitle className="text-[15px] leading-snug tracking-tight text-balance">
                      {task.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 text-sm leading-relaxed">
                      {task.definitionOfDone}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge variant={taskStatusVariant(task.status)}>
                      {taskStatusLabel(task.status)}
                    </Badge>
                  </CardContent>
                </Card>
              );
            }
            return (
              <div key={task.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="truncate text-sm font-semibold">
                    {task.title}
                  </span>
                  <Badge
                    variant={taskStatusVariant(task.status)}
                    className="ml-auto shrink-0"
                  >
                    {taskStatusLabel(task.status)}
                  </Badge>
                </div>
                <ProofCard
                  proof={toProofCard(proof, session.user.id, needed)}
                  viewerId={session.user.id}
                  mode="history"
                />
              </div>
            );
          })}
        </div>
      )}

      {checkIn || updates.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-[15px]">Check-ins that day</CardTitle>
            <CardDescription>
              {updates.length > 0
                ? `${updates.length} posts. No rewriting history.`
                : "One post. No rewriting history."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {(updates.length > 0
              ? updates
              : checkIn
                ? [
                    {
                      id: checkIn.id,
                      signal: checkIn.signal,
                      blocker: checkIn.blocker,
                      createdAt: checkIn.updatedAt,
                    },
                  ]
                : []
            ).map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={signalVariant(item.signal)}>
                    {item.signal.toLowerCase().replaceAll("_", " ")}
                  </Badge>
                  <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                    {historyTime.format(new Date(item.createdAt))}
                  </span>
                </div>
                {item.blocker ? (
                  <p className="text-sm leading-snug text-pretty">
                    {item.blocker}
                  </p>
                ) : (
                  <p className="text-[13px] text-muted-foreground italic">
                    No note. Just vibes.
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
