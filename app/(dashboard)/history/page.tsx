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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  formatHistoryTime,
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

  const [members, tasks, updates, checkIns] = await Promise.all([
    getPrisma().membership.findMany({
      where: { circleId: membership.circleId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { id: true, name: true, image: true, initials: true } },
      },
    }),
    getPrisma().commitment.findMany({
      where: { circleId: membership.circleId, day },
      orderBy: { dueAt: "asc" },
      take: 100,
      include: {
        user: { select: { id: true, name: true, image: true, initials: true } },
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
    getPrisma().checkInUpdate.findMany({
      where: { circleId: membership.circleId, day },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { id: true, name: true, image: true, initials: true } },
      },
    }),
    getPrisma().checkIn.findMany({
      where: { circleId: membership.circleId, day },
      include: {
        user: { select: { id: true, name: true, image: true, initials: true } },
      },
    }),
  ]);

  const memberCount = members.length;
  const verified = tasks.filter((task) => task.status === "VERIFIED").length;
  const needed = requiredApprovalsForCircle(memberCount);

  const tasksByUser = new Map<string, typeof tasks>();
  for (const task of tasks) {
    const list = tasksByUser.get(task.userId) ?? [];
    list.push(task);
    tasksByUser.set(task.userId, list);
  }

  const updatesByUser = new Map<string, typeof updates>();
  for (const update of updates) {
    const list = updatesByUser.get(update.userId) ?? [];
    list.push(update);
    updatesByUser.set(update.userId, list);
  }

  const checkInByUser = new Map<string, (typeof checkIns)[number]>();
  for (const checkIn of checkIns) {
    checkInByUser.set(checkIn.userId, checkIn);
  }

  const userById = new Map<
    string,
    { id: string; name: string; image: string | null; initials: string }
  >();
  for (const member of members) {
    userById.set(member.user.id, member.user);
  }
  for (const task of tasks) {
    if (!userById.has(task.user.id)) userById.set(task.user.id, task.user);
  }
  for (const update of updates) {
    if (!userById.has(update.user.id))
      userById.set(update.user.id, update.user);
  }
  for (const checkIn of checkIns) {
    if (!userById.has(checkIn.user.id))
      userById.set(checkIn.user.id, checkIn.user);
  }

  const orderedIds = [
    ...members.map((member) => member.user.id),
    ...[...userById.keys()].filter(
      (id) => !members.some((member) => member.user.id === id),
    ),
  ];
  // Only people who actually did something that day. Keeps old days clean
  // when the circle was smaller.
  const activeIds = orderedIds.filter(
    (id) =>
      tasksByUser.has(id) || updatesByUser.has(id) || checkInByUser.has(id),
  );

  return (
    <>
      <PageHeader
        title="History"
        description={
          tasks.length === 0
            ? "Nothing locked in that day."
            : `${verified}/${tasks.length} verified across the squad. Receipts below.`
        }
        actions={<HistoryNav day={dayKey} today={todayKey} />}
      >
        <Badge variant="secondary">{formatDayLong(dayKey)}</Badge>
      </PageHeader>

      {activeIds.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>Quiet day</EmptyTitle>
            <EmptyDescription>
              Nobody locked anything in. Either rest day or collective bullshit
              — you decide which story to tell.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {activeIds.map((userId) => {
            const user = userById.get(userId);
            if (!user) return null;
            const userTasks = tasksByUser.get(userId) ?? [];
            const userUpdates = updatesByUser.get(userId) ?? [];
            const fallbackCheckIn = checkInByUser.get(userId);
            // Old check-ins from before per-post history still show up once.
            const checkInItems =
              userUpdates.length > 0
                ? userUpdates
                : fallbackCheckIn
                  ? [
                      {
                        id: fallbackCheckIn.id,
                        signal: fallbackCheckIn.signal,
                        blocker: fallbackCheckIn.blocker,
                        createdAt: fallbackCheckIn.updatedAt,
                      },
                    ]
                  : [];
            const userVerified = userTasks.filter(
              (task) => task.status === "VERIFIED",
            ).length;
            return (
              <Card key={user.id} size="sm">
                <CardHeader>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarImage src={user.image ?? undefined} alt="" />
                      <AvatarFallback>{user.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <CardTitle className="truncate text-[15px] tracking-tight">
                        {user.name}
                        {user.id === session.user.id ? " (you)" : ""}
                      </CardTitle>
                      <CardDescription className="truncate text-[13px]">
                        {userTasks.length === 0
                          ? "No promises. Suspicious."
                          : `${userVerified}/${userTasks.length} verified`}
                        {checkInItems.length > 0
                          ? ` · ${checkInItems.length} ${checkInItems.length === 1 ? "post" : "posts"}`
                          : " · no check-in"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {userTasks.map((task) => {
                    const proof = task.proofs[0] ?? null;
                    if (!proof) {
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
                          <p className="line-clamp-2 px-1 text-sm leading-relaxed text-muted-foreground">
                            {task.definitionOfDone}
                          </p>
                        </div>
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
                  {checkInItems.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="px-1 text-xs font-medium text-muted-foreground">
                        Check-ins that day · no rewriting history
                      </p>
                      {checkInItems.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-1.5 rounded-xl bg-muted/60 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant={signalVariant(item.signal)}>
                              {item.signal.toLowerCase().replaceAll("_", " ")}
                            </Badge>
                            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                              {formatHistoryTime(item.createdAt)}
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
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
