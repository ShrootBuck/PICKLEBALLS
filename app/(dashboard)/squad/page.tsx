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
  const [members, proofs, events, digest] = await Promise.all([
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
      include: { owner: true, commitment: true },
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

      <div className="grid gap-6 lg:grid-cols-3">
        {members.map(({ user, role }) => {
          const checkIn = user.checkIns[0];
          const verified = user.commitments.filter(
            (task) => task.status === "VERIFIED",
          ).length;
          return (
            <Card key={user.id}>
              <CardHeader>
                <Avatar className="size-10">
                  <AvatarImage src={user.image ?? undefined} alt="" />
                  <AvatarFallback>{user.initials}</AvatarFallback>
                </Avatar>
                <CardTitle>{user.name}</CardTitle>
                <CardDescription>
                  {user.discordUsername
                    ? `@${user.discordUsername}`
                    : "Discord member"}
                </CardDescription>
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
                  {user.commitments.map((task) => (
                    <Item key={task.id} size="sm" variant="muted">
                      <ItemContent>
                        <ItemTitle>{task.title}</ItemTitle>
                        <ItemDescription>
                          {task.status.toLowerCase().replace("_", " ")}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  ))}
                  {user.commitments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No tasks. Suspiciously peaceful.
                    </p>
                  )}
                </ItemGroup>
                {checkIn && (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {checkIn.signal.toLowerCase().replace("_", " ")}
                    {checkIn.blocker ? ` · ${checkIn.blocker}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {digest && (
        <Card>
          <CardHeader>
            <Bot />
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
          <Camera />
          <CardTitle>Proof queue</CardTitle>
          <CardDescription>
            One non-owner review resolves each receipt.
          </CardDescription>
          <CardAction>
            <Badge variant="secondary">{proofs.length} waiting</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {proofs.map((proof) => (
            <Card key={proof.id} size="sm">
              <AspectRatio ratio={4 / 3}>
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
                  {proof.owner.name} · {proof.isLate ? "late proof" : "on time"}
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
                {proof.ownerId !== session.user.id && (
                  <ReviewProof
                    proofId={proof.id}
                    taskTitle={proof.commitment.title}
                  />
                )}
                {proof.ownerId === session.user.id && (
                  <Badge variant="secondary">
                    You cannot review your own proof
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
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
          <Activity />
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
