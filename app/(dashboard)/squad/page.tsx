import { Activity, Bot, Camera, ClockAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { GenerateBrief } from "@/components/squad/generate-brief";
import { ReviewProof } from "@/components/squad/review-proof";
import { AspectRatio } from "@/components/ui/aspect-ratio";
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
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { phoenixDateKey, requireDateKey } from "@/lib/time";

export const metadata: Metadata = { title: "Squad" };

export default async function SquadPage() {
  const { session, membership } = await requirePageMembership();
  const dayKey = phoenixDateKey();
  const day = requireDateKey(dayKey);
  const [members, proofs, todayHistory, events, digest] = await Promise.all([
    getPrisma().membership.findMany({
      where: { circleId: membership.circleId },
      orderBy: { createdAt: "asc" },
      include: {
        user: {
          include: {
            commitments: {
              where: { circleId: membership.circleId, day },
              orderBy: { dueAt: "asc" },
            },
            checkIns: {
              where: { circleId: membership.circleId, day },
              take: 1,
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
    getPrisma().dailySquadDigest.findUnique({
      where: { circleId_day: { circleId: membership.circleId, day } },
    }),
  ]);
  return (
    <>
      <section className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-1.5">
          <Badge variant="secondary" className="w-fit">
            {members.length} friends · one court
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Accountability, minus the LinkedIn sludge.
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            See promises, proof, and blockers. Help first; roast second.
          </p>
        </div>
        {!digest && <GenerateBrief />}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        {members.map(({ user, role }) => {
          const checkIn = user.checkIns[0];
          const verified = user.commitments.filter(
            (task) => task.status === "VERIFIED",
          ).length;
          return (
            <Card key={user.id}>
              <CardHeader>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarImage src={user.image ?? undefined} alt="" />
                    <AvatarFallback>{user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <CardTitle className="truncate">{user.name}</CardTitle>
                    <CardDescription className="truncate">
                      {user.discordUsername
                        ? `@${user.discordUsername}`
                        : "Discord member"}
                    </CardDescription>
                  </div>
                </div>
                <CardAction>
                  <Badge variant={role === "OWNER" ? "default" : "secondary"}>
                    {role === "OWNER"
                      ? "Owner"
                      : `${verified}/${user.commitments.length}`}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ItemGroup>
                  {user.commitments.map((task) => {
                    const statusVariant =
                      task.status === "VERIFIED"
                        ? ("default" as const)
                        : task.status === "MISSED"
                          ? ("destructive" as const)
                          : task.status === "AWAITING_REVIEW"
                            ? ("secondary" as const)
                            : ("outline" as const);
                    return (
                      <Item key={task.id} size="sm" variant="muted">
                        <ItemContent>
                          <ItemTitle className="flex items-center gap-2">
                            <span className="truncate">{task.title}</span>
                            <Badge
                              variant={statusVariant}
                              className="shrink-0 text-[10px] leading-none"
                            >
                              {task.status.toLowerCase().replaceAll("_", " ")}
                            </Badge>
                          </ItemTitle>
                        </ItemContent>
                      </Item>
                    );
                  })}
                  {user.commitments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No tasks. Suspiciously peaceful.
                    </p>
                  )}
                </ItemGroup>
                {checkIn && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <Badge
                      variant={
                        checkIn.signal === "AT_RISK"
                          ? "destructive"
                          : checkIn.signal === "CLEAR"
                            ? "default"
                            : "secondary"
                      }
                      className="capitalize"
                    >
                      {checkIn.signal.toLowerCase().replaceAll("_", " ")}
                    </Badge>
                    {checkIn.blocker && (
                      <span className="text-muted-foreground">
                        · {checkIn.blocker}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {digest && (
        <Card>
          <CardHeader>
            <div className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Bot className="size-4" />
            </div>
            <CardTitle>Today’s squad brief</CardTitle>
            <CardDescription>
              Cached once per Phoenix day. The model diagnoses; it does not
              judge proof.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>{digest.summary}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Camera className="size-4" />
          </div>
          <CardTitle>Proof queue</CardTitle>
          <CardDescription>
            Two approvals required. One challenge sends it back. You cannot
            review your own.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{proofs.length} waiting</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {proofs.map((proof) => {
            const approvals = proof.reviews.filter(
              (r) => r.decision === "APPROVED",
            ).length;
            const alreadyReviewed = proof.reviews.some(
              (r) => r.reviewerId === session.user.id,
            );
            return (
              <Card key={proof.id} size="sm" className="overflow-hidden">
                <AspectRatio
                  ratio={4 / 3}
                  className="overflow-hidden rounded-t-xl"
                >
                  <Image
                    className="size-full object-cover"
                    src={`/api/proofs/${proof.id}/image`}
                    alt={`Proof for ${proof.commitment.title}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    unoptimized
                  />
                </AspectRatio>
                <CardHeader>
                  <CardTitle>{proof.commitment.title}</CardTitle>
                  <CardDescription>
                    {proof.owner.name} ·{" "}
                    {proof.isLate ? "late proof" : "on time"} · {approvals}/2
                    approvals
                  </CardDescription>
                  {proof.isLate && (
                    <CardAction>
                      <Badge variant="destructive">Late</Badge>
                    </CardAction>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {proof.ownerNote && (
                    <p className="text-sm">“{proof.ownerNote}”</p>
                  )}
                  {proof.aiStatus === "SUCCEEDED" && (
                    <Item variant="muted">
                      <ItemMedia variant="icon">
                        <Bot />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>AI read</ItemTitle>
                        <ItemDescription>
                          {proof.aiVisibleEvidence}
                        </ItemDescription>
                        <ItemDescription>
                          Question: {proof.aiReviewerQuestion}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  )}
                  {proof.ownerId === session.user.id ? (
                    <Badge variant="secondary">
                      You cannot review your own proof
                    </Badge>
                  ) : alreadyReviewed ? (
                    <Badge variant="outline">You already reviewed</Badge>
                  ) : (
                    <ReviewProof
                      proofId={proof.id}
                      taskTitle={proof.commitment.title}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
          {proofs.length === 0 && (
            <Empty className="md:col-span-2">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClockAlert />
                </EmptyMedia>
                <EmptyTitle>No proof waiting</EmptyTitle>
                <EmptyDescription>
                  Either everyone is working or nobody has posted. Those are
                  very different situations.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Camera className="size-4" />
          </div>
          <CardTitle>Today&apos;s history — no FOMO</CardTitle>
          <CardDescription>
            Every proof posted for {dayKey} — images included, even after
            verdict.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{todayHistory.length} proofs</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {todayHistory.map((proof) => {
            const approvals = proof.reviews.filter(
              (r) => r.decision === "APPROVED",
            ).length;
            const statusLabel =
              proof.reviewStatus === "APPROVED"
                ? "Verified"
                : proof.reviewStatus === "CHALLENGED"
                  ? "Challenged"
                  : `${approvals}/2 approvals`;
            return (
              <Card
                key={`history-${proof.id}`}
                size="sm"
                className="overflow-hidden"
              >
                <AspectRatio
                  ratio={4 / 3}
                  className="overflow-hidden rounded-t-xl"
                >
                  <Image
                    className="size-full object-cover"
                    src={`/api/proofs/${proof.id}/image`}
                    alt={`Proof for ${proof.commitment.title}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    unoptimized
                  />
                </AspectRatio>
                <CardHeader>
                  <CardTitle>{proof.commitment.title}</CardTitle>
                  <CardDescription>
                    {proof.owner.name} · {statusLabel}{" "}
                    {proof.isLate ? "· late" : ""}
                  </CardDescription>
                  <CardAction>
                    <Badge
                      variant={
                        proof.reviewStatus === "APPROVED"
                          ? "default"
                          : proof.reviewStatus === "CHALLENGED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {proof.reviewStatus.toLowerCase()}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-1">
                  {proof.ownerNote && (
                    <p className="text-sm text-muted-foreground">
                      “{proof.ownerNote}”
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Phoenix",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(proof.submittedAt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          {todayHistory.length === 0 && (
            <Empty className="md:col-span-2">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Camera />
                </EmptyMedia>
                <EmptyTitle>No proofs today yet</EmptyTitle>
                <EmptyDescription>
                  When someone posts, you will see the image here. No more FOMO.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Activity className="size-4" />
          </div>
          <CardTitle>Actual activity</CardTitle>
          <CardDescription>
            Stored events, not a fake feed with suspiciously perfect timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {events.map((event) => (
              <Item key={event.id}>
                <ItemMedia variant="icon">
                  <Users />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {event.actor.name} {event.summary}
                  </ItemTitle>
                  <ItemDescription>
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Phoenix",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(event.createdAt)}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>
    </>
  );
}
