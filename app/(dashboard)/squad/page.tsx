import {
  Activity,
  Camera,
  CheckCircle2,
  CircleDashed,
  ClockAlert,
  Flame,
  History,
  PencilLine,
  TriangleAlert,
  Upload,
} from "lucide-react";
import type { Metadata } from "next";
import { PageHeader, PageSection } from "@/components/layout/page-header";
import { ProofCard, type ProofCardData } from "@/components/squad/proof-card";
import { SocialReplyThread } from "@/components/squad/social-reply-thread";
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
import { formatDayLong, phoenixDateKey, requireDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Squad" };

function activityIcon(kind: string) {
  switch (kind) {
    case "TASK_CREATED":
      return PencilLine;
    case "PROOF_SUBMITTED":
      return Upload;
    case "PROOF_APPROVED":
      return CheckCircle2;
    case "PROOF_CHALLENGED":
      return TriangleAlert;
    case "TASK_MISSED":
      return ClockAlert;
    case "TASK_EDITED":
    case "TASK_RENEGOTIATED":
      return History;
    case "CHECK_IN_SET":
      return Activity;
    default:
      return CircleDashed;
  }
}

function toProofCard(
  proof: {
    id: string;
    ownerNote: string | null;
    isLate: boolean;
    submittedAt: Date;
    reviewStatus: "PENDING" | "APPROVED" | "CHALLENGED";
    aiStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
    aiVisibleEvidence: string | null;
    aiReviewerQuestion: string | null;
    aiUncertainty: string | null;
    aiTaskMatch: string | null;
    aiOneLiner: string | null;
    ownerId: string;
    owner: { name: string };
    commitment: { title: string };
    reviews: Array<{ decision: string; reviewerId: string }>;
  },
  viewerId: string,
): ProofCardData {
  return {
    id: proof.id,
    title: proof.commitment.title,
    ownerName: proof.owner.name,
    ownerId: proof.ownerId,
    ownerNote: proof.ownerNote,
    isLate: proof.isLate,
    submittedAt: proof.submittedAt.toISOString(),
    reviewStatus: proof.reviewStatus,
    approvals: proof.reviews.filter((review) => review.decision === "APPROVED")
      .length,
    alreadyReviewed: proof.reviews.some(
      (review) => review.reviewerId === viewerId,
    ),
    aiStatus: proof.aiStatus,
    aiVisibleEvidence: proof.aiVisibleEvidence,
    aiReviewerQuestion: proof.aiReviewerQuestion,
    aiUncertainty: proof.aiUncertainty,
    aiTaskMatch: proof.aiTaskMatch,
    aiOneLiner: proof.aiOneLiner,
  };
}

function taskStatusVariant(status: string) {
  if (status === "VERIFIED") return "default" as const;
  if (status === "MISSED") return "destructive" as const;
  if (status === "AWAITING_REVIEW") return "secondary" as const;
  return "outline" as const;
}

function signalVariant(signal: string) {
  if (signal === "AT_RISK") return "destructive" as const;
  if (signal === "CLEAR") return "default" as const;
  return "secondary" as const;
}

export default async function SquadPage() {
  const { session, membership } = await requirePageMembership();
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
                  take: 10,
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
      include: {
        owner: true,
        commitment: true,
        reviews: true,
      },
    }),
    getPrisma().taskProof.findMany({
      where: {
        circleId: membership.circleId,
        replacedById: null,
        commitment: { day },
      },
      orderBy: { submittedAt: "desc" },
      take: 20,
      include: {
        owner: true,
        commitment: true,
        reviews: true,
      },
    }),
    getPrisma().activityEvent.findMany({
      where: { circleId: membership.circleId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: true },
    }),
  ]);

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

      <PageSection
        title="Needs a verdict"
        action={<Badge variant="secondary">{proofs.length} waiting</Badge>}
      >
        {proofs.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClockAlert />
              </EmptyMedia>
              <EmptyTitle>Nothing to judge</EmptyTitle>
              <EmptyDescription>
                Either everyone is grinding or nobody posted shit. Very
                different situations.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {proofs.map((proof) => (
              <ProofCard
                key={proof.id}
                proof={toProofCard(proof, session.user.id)}
                viewerId={session.user.id}
                mode="review"
              />
            ))}
          </div>
        )}
      </PageSection>

      <PageSection title="Today's board">
        <div className="grid items-start gap-3 sm:grid-cols-2">
          {members.map(({ user, role }) => {
            const checkIn = user.checkIns[0];
            const verified = user.commitments.filter(
              (task) => task.status === "VERIFIED",
            ).length;
            const total = user.commitments.length;
            const atRisk = checkIn?.signal === "AT_RISK";
            return (
              <Card
                key={user.id}
                size="sm"
                className={atRisk ? "border-destructive/40" : ""}
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
                        {checkIn?.signal === "AT_RISK"
                          ? ", needs backup"
                          : checkIn?.signal === "CLEAR"
                            ? ", chilling"
                            : ""}
                      </CardDescription>
                    </div>
                  </div>
                  <CardAction>
                    <Badge variant={role === "OWNER" ? "default" : "secondary"}>
                      {role === "OWNER" ? (
                        <>
                          <Flame data-icon="inline-start" />
                          Owner
                        </>
                      ) : (
                        `${verified}/${total}`
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
                            {task.status.toLowerCase().replaceAll("_", " ")}
                          </Badge>
                        </div>
                        <SocialReplyThread
                          targetType="COMMITMENT"
                          targetId={task.id}
                          initialReplies={task.replies.map((reply) => ({
                            ...reply,
                            createdAt: reply.createdAt.toISOString(),
                          }))}
                          compact
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
                            {checkIn.signal.toLowerCase().replaceAll("_", " ")}
                          </Badge>
                          {checkIn.updates.length > 1 ? (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {checkIn.updates.length} posts today
                            </span>
                          ) : null}
                        </div>
                        {checkIn.blocker ? (
                          <p className="text-sm leading-relaxed text-pretty">
                            {checkIn.blocker}
                          </p>
                        ) : (
                          <p className="text-[13px] text-muted-foreground italic">
                            No blocker posted. Fingers crossed.
                          </p>
                        )}
                        {checkIn.updates.length > 1 ? (
                          <div className="flex flex-col gap-1.5 border-l-2 pl-3">
                            {checkIn.updates.slice(1, 4).map((older) => (
                              <p
                                key={older.id}
                                className="text-[13px] leading-snug text-muted-foreground"
                              >
                                <span className="font-medium capitalize">
                                  {older.signal
                                    .toLowerCase()
                                    .replaceAll("_", " ")}
                                </span>
                                {older.blocker ? ` — ${older.blocker}` : ""}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        <SocialReplyThread
                          targetType="CHECK_IN"
                          targetId={checkIn.id}
                          initialReplies={checkIn.replies.map((reply) => ({
                            ...reply,
                            createdAt: reply.createdAt.toISOString(),
                          }))}
                          compact
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
      </PageSection>

      <PageSection
        title="Today's proof"
        action={<Badge variant="secondary">{todayHistory.length} posted</Badge>}
      >
        {todayHistory.length === 0 ? (
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
                proof={toProofCard(proof, session.user.id)}
                viewerId={session.user.id}
                mode="history"
              />
            ))}
          </div>
        )}
      </PageSection>

      <PageSection
        title="Squad log"
        action={<Badge variant="secondary">{events.length}</Badge>}
      >
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
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: "America/Phoenix",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(event.createdAt)}
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
      </PageSection>
    </>
  );
}
