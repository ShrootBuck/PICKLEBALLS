import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BucketItemCard } from "@/components/bucket-list/bucket-item-card";
import { CircleDestination } from "@/components/circles/circle-destination";
import { PageSection } from "@/components/layout/page-header";
import { BackButton } from "@/components/social/back-button";
import { toThreadReply } from "@/components/squad/proof-helpers";
import { SocialReplyThread } from "@/components/squad/social-reply-thread";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getBucketItem } from "@/lib/bucket-list-data";
import type { BucketItemView, BucketPerson } from "@/lib/bucket-list-policy";
import { likeInclude } from "@/lib/like-summary";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { socialAuthorSelect } from "@/lib/social-data";

export const metadata: Metadata = { title: "Bucket list" };

function VoteBreakdown({
  item,
  members,
  viewerId,
}: {
  item: BucketItemView;
  members: BucketPerson[];
  viewerId: string;
}) {
  const proposal = item.stage !== "COMPLETION";
  const inFavor = new Set(item.inFavor.map((person) => person.id));
  const against = new Set(item.against.map((person) => person.id));
  return (
    <PageSection
      title={
        item.stage === "PROPOSAL"
          ? "Interested"
          : proposal
            ? "RSVPs"
            : "Participant confirmations"
      }
      description={
        proposal
          ? "Interest and RSVPs are optional unless this plan explicitly needs everyone."
          : "Only the participants listed here need to confirm. New members do not change this list."
      }
    >
      <ul className="flex flex-col divide-y divide-border rounded-lg border">
        {(proposal
          ? [
              ...new Map(
                [
                  ...members,
                  ...item.inFavor,
                  ...item.against,
                  ...item.waiting,
                ].map((person) => [person.id, person]),
              ).values(),
            ]
          : item.participants
        ).map((member) => {
          const state = inFavor.has(member.id)
            ? "in"
            : against.has(member.id)
              ? "out"
              : "waiting";
          return (
            <li
              key={member.id}
              className="flex min-w-0 items-center gap-3 px-3 py-2.5"
            >
              <Avatar size="sm">
                <AvatarImage src={member.image ?? undefined} alt="" />
                <AvatarFallback>{member.initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm">
                {member.name}
                {member.id === viewerId ? " (you)" : ""}
              </span>
              <Badge
                variant={
                  state === "in"
                    ? "success"
                    : state === "out"
                      ? "destructive"
                      : "outline"
                }
              >
                {state === "in"
                  ? proposal
                    ? item.stage === "PROPOSAL"
                      ? "Interested"
                      : "Going"
                    : "Confirmed"
                  : state === "out"
                    ? proposal
                      ? item.stage === "PROPOSAL"
                        ? "Not interested"
                        : "Can't make it"
                      : "Not yet"
                    : "No response"}
              </Badge>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}

export default async function BucketItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ circle?: string }>;
}) {
  const { session, membership } = await requirePageMembership();
  const { id } = await params;
  const query = await searchParams;
  if (id.length > 100) notFound();
  if (
    typeof query.circle === "string" &&
    query.circle !== membership.circleId
  ) {
    const destination = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: query.circle },
      },
      select: { circleId: true },
    });
    if (!destination) notFound();
    return (
      <CircleDestination
        circleId={destination.circleId}
        destination={`/bucket-list/${encodeURIComponent(id)}`}
      />
    );
  }
  const circleId = membership.circleId;
  const [result, replies] = await Promise.all([
    getBucketItem(circleId, id, session.user.id),
    getPrisma().socialReply.findMany({
      where: { circleId, bucketItemId: id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      include: {
        ...likeInclude(session.user.id),
        author: { select: socialAuthorSelect },
      },
    }),
  ]);
  if (!result) notFound();
  const { item, members } = result;
  if (item.status === "WITHDRAWN")
    return (
      <>
        <BackButton />
        <Alert>
          <AlertTitle>This idea was withdrawn</AlertTitle>
          <AlertDescription>
            It’s no longer up for a vote.{" "}
            <Link href="/bucket-list">See the bucket list</Link>
          </AlertDescription>
        </Alert>
      </>
    );
  return (
    <>
      <BackButton />
      <BucketItemCard item={item} viewerId={session.user.id} detail />
      {item.stage && (
        <VoteBreakdown
          item={item}
          members={members}
          viewerId={session.user.id}
        />
      )}
      <section id="comments" className="scroll-mt-6">
        <h2 className="mb-4 text-base font-semibold">Comments</h2>
        <SocialReplyThread
          key={id}
          targetType="BUCKET_ITEM"
          targetId={id}
          initialReplies={replies.map(toThreadReply)}
          currentUserId={session.user.id}
          contextLabel={`Commenting on “${item.title}”`}
          replyLabel="Add a comment"
          defaultExpanded
          composerVisible
          scrollOnExpand={false}
        />
      </section>
    </>
  );
}
