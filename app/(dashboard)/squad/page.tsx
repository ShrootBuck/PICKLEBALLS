import { Camera, Flame } from "lucide-react";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { activityIcon } from "@/components/layout/activity-icons";
import { PageHeader } from "@/components/layout/page-header";
import { ProofCard } from "@/components/squad/proof-card";
import {
  signalLabel,
  signalVariant,
  taskStatusLabel,
  taskStatusVariant,
  toProofCard,
  toThreadReply,
} from "@/components/squad/proof-helpers";
import { SocialReplyThread } from "@/components/squad/social-reply-thread";
import { SquadTabs } from "@/components/squad/squad-tabs";
import { VerdictList } from "@/components/squad/verdict-list";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { requiredApprovalsForCircle } from "@/lib/task-policy";
import {
  formatDayLong,
  formatHistoryTime,
  formatReplyTime,
  phoenixDateKey,
  requireDateKey,
} from "@/lib/time";

export const metadata: Metadata = { title: "Squad" };

export default async function SquadPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const params = await searchParams;
  const focusId = params.focus;
  const dayKey = phoenixDateKey();
  const day = requireDateKey(dayKey);
  const friendlyDay = formatDayLong(dayKey);
  const [members, proofs, todayHistory, events] = await Promise.all([
    getPrisma().membership.findMany({
      where: { circleId: membership.circleId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          include: {
            commitments: {
              where: { circleId: membership.circleId, day },
              orderBy: { dueAt: "asc" },
              include: {
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
            checkIns: {
              where: { circleId: membership.circleId, day },
              take: 1,
              include: {
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
                updates: {
                  orderBy: { createdAt: "desc" },
                  take: 20,
                },
              },
            },
          },
        },
      },
    }),
    getPrisma().taskProof.findMany({
      where: {
        circleId: membership.circleId,
        reviewStatus: "PENDING",
        replacedById: null,
      },
      orderBy: { submittedAt: "asc" },
      take: 20,
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
                  select: { id: true, name: true, image: true, initials: true },
                },
              },
            },
          },
        },
      },
    }),
    getPrisma().taskProof.findMany({
      where: {
        circleId: membership.circleId,
        replacedById: null,
        reviewStatus: { not: "PENDING" },
        commitment: { day },
      },
      orderBy: { submittedAt: "desc" },
      take: 20,
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
                  select: { id: true, name: true, image: true, initials: true },
                },
              },
            },
          },
        },
      },
    }),
    getPrisma().activityEvent.findMany({
      where: {
        circleId: membership.circleId,
        kind: {
          in: [
            "PROOF_SUBMITTED",
            "PROOF_APPROVED",
            "PROOF_CHALLENGED",
            "TASK_MISSED",
            "TASK_RENEGOTIATED",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const requiredApprovals = requiredApprovalsForCircle(members.length);

  return (
    <>
      <PageHeader
        title="Squad"
        description="See the work. Talk shit. Help first, roast second."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{friendlyDay}</Badge>
          <Badge variant="outline">
            {members.length}{" "}
            {members.length === 1 ? "degenerate" : "degenerates"}
          </Badge>
        </div>
      </PageHeader>

      <SquadTabs
        defaultTab={proofs.length > 0 ? "verdicts" : "board"}
        verdictCount={proofs.length}
        proofCount={todayHistory.length}
        verdicts={
          <VerdictList
            initial={proofs.map((proof) =>
              toProofCard(proof, session.user.id, requiredApprovals),
            )}
            viewerId={session.user.id}
            focusId={focusId}
          />
        }
        board={
          <div className="grid items-start gap-3 sm:grid-cols-2">
            {members.map(({ user, role }, index) => {
              const checkIn = user.checkIns[0];
              const verified = user.commitments.filter(
                (task) => task.status === "VERIFIED",
              ).length;
              const total = user.commitments.length;
              const isNay =
                checkIn?.signal === "NAY" || checkIn?.signal === "AT_RISK";
              // Full post history, newest first. Old check-ins from before
              // per-post history still show up once via the check-in row.
              const posts =
                checkIn && checkIn.updates.length > 0
                  ? checkIn.updates
                  : checkIn?.blocker
                    ? [
                        {
                          id: checkIn.id,
                          signal: checkIn.signal,
                          blocker: checkIn.blocker,
                          createdAt: checkIn.updatedAt,
                        },
                      ]
                    : [];
              return (
                <Card
                  key={user.id}
                  size="sm"
                  style={
                    {
                      "--board-col": index % 2 === 0 ? 1 : 2,
                      "--board-row": Math.floor(index / 2) + 1,
                    } as CSSProperties
                  }
                  className={`${isNay ? "border-destructive/40 " : ""}sm:[grid-column-start:var(--board-col)] sm:[grid-row-start:var(--board-row)]`}
                >
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
                          {total === 0
                            ? "No promises. Suspicious."
                            : `${verified}/${total} verified`}
                          {checkIn?.signal === "NAY" ||
                          checkIn?.signal === "AT_RISK"
                            ? ", needs backup"
                            : checkIn
                              ? ", chilling"
                              : ""}
                        </CardDescription>
                      </div>
                    </div>
                    <CardAction>
                      <Badge
                        variant={role === "OWNER" ? "default" : "secondary"}
                      >
                        {role === "OWNER" ? (
                          <>
                            <Flame data-icon="inline-start" />
                            Owner
                          </>
                        ) : (
                          "Member"
                        )}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <ItemGroup className="gap-2">
                      {user.commitments.map((task) => (
                        <Item
                          key={task.id}
                          size="sm"
                          variant="muted"
                          className="flex-col items-stretch gap-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <ItemTitle className="min-w-0 flex-1 text-sm leading-snug">
                              {task.title}
                            </ItemTitle>
                            <Badge variant={taskStatusVariant(task.status)}>
                              {taskStatusLabel(task.status)}
                            </Badge>
                          </div>
                          <SocialReplyThread
                            targetType="COMMITMENT"
                            targetId={task.id}
                            initialReplies={task.replies.map(toThreadReply)}
                            currentUserId={session.user.id}
                            compact
                            defaultExpanded={focusId === task.id}
                          />
                        </Item>
                      ))}
                      {user.commitments.length === 0 ? (
                        <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                          No tasks. Either done or bullshitting.
                        </p>
                      ) : null}
                    </ItemGroup>
                    {checkIn ? (
                      <>
                        <Separator />
                        <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={signalVariant(checkIn.signal)}
                              className="capitalize"
                            >
                              {signalLabel(checkIn.signal)}
                            </Badge>
                            {posts.length > 1 ? (
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {posts.length} posts today
                              </span>
                            ) : null}
                          </div>
                          {posts.length > 0 ? (
                            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-0.5">
                              {posts.map((post) => (
                                <div
                                  key={post.id}
                                  className="flex flex-col gap-1.5 rounded-lg bg-background/60 px-2.5 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant={signalVariant(post.signal)}
                                      className="text-[11px] capitalize"
                                    >
                                      {signalLabel(post.signal)}
                                    </Badge>
                                    <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
                                      {formatHistoryTime(post.createdAt)}
                                    </span>
                                  </div>
                                  {post.blocker ? (
                                    <p className="text-[13px] leading-snug text-pretty">
                                      {post.blocker}
                                    </p>
                                  ) : (
                                    <p className="text-[13px] text-muted-foreground italic">
                                      No note. Just vibes.
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[13px] text-muted-foreground italic">
                              No blocker posted. Fingers crossed.
                            </p>
                          )}
                          <SocialReplyThread
                            targetType="CHECK_IN"
                            targetId={checkIn.id}
                            initialReplies={checkIn.replies.map(toThreadReply)}
                            currentUserId={session.user.id}
                            compact
                            defaultExpanded={focusId === checkIn.id}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <Separator />
                        <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-center text-[13px] text-muted-foreground">
                          No check-in yet. Probably bullshitting.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        }
        proof={
          todayHistory.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Camera />
                </EmptyMedia>
                <EmptyTitle>No proof yet</EmptyTitle>
                <EmptyDescription>
                  Nobody proved shit today. Be the first so you can talk.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {todayHistory.map((proof) => (
                <ProofCard
                  key={`history-${proof.id}`}
                  proof={toProofCard(proof, session.user.id, requiredApprovals)}
                  viewerId={session.user.id}
                  mode="history"
                  focusId={focusId}
                />
              ))}
            </div>
          )
        }
        log={
          <Card size="sm">
            <CardContent>
              <ItemGroup className="gap-1">
                {events.map((event) => {
                  const Icon = activityIcon(event.kind);
                  return (
                    <Item key={event.id} size="sm">
                      <ItemMedia variant="icon">
                        <Icon />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle className="text-sm">
                          {event.actor.name} {event.summary}
                        </ItemTitle>
                        <ItemDescription className="tabular-nums">
                          {formatReplyTime(event.createdAt)}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  );
                })}
                {events.length === 0 ? (
                  <p className="rounded-xl border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                    Nothing yet. Do something worth logging.
                  </p>
                ) : null}
              </ItemGroup>
            </CardContent>
          </Card>
        }
      />
    </>
  );
}
