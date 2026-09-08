import { Bot, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { BackButton } from "@/components/social/back-button";
import { PostCard } from "@/components/social/post-card";
import { AiRetryButton } from "@/components/squad/ai-retry-button";
import { toThreadReply } from "@/components/squad/proof-helpers";
import { ProofReviewList } from "@/components/squad/proof-review-list";
import { SocialReplyThread } from "@/components/squad/social-reply-thread";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import { postHref } from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";
import { requirePageMembership } from "@/lib/request";
import { getFeedPage, socialAuthorSelect } from "@/lib/social-data";

export const metadata: Metadata = { title: "Post" };
const replyInclude = {
  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  take: 50,
  include: { author: { select: socialAuthorSelect } },
} satisfies Prisma.SocialReplyFindManyArgs;

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{
    circle?: string;
    discussion?: string;
    focus?: string;
  }>;
}) {
  const { session, membership } = await requirePageMembership();
  const { kind, id } = await params;
  const query = await searchParams;
  if ((kind !== "proof" && kind !== "check-in") || id.length > 100) notFound();
  if (
    typeof query.circle === "string" &&
    query.circle !== membership.circleId
  ) {
    const allowed = await getPrisma().membership.findUnique({
      where: {
        userId_circleId: { userId: session.user.id, circleId: query.circle },
      },
    });
    if (!allowed) notFound();
    const destination = new URLSearchParams({ circle: query.circle });
    if (query.discussion === "legacy") destination.set("discussion", "legacy");
    if (typeof query.focus === "string") destination.set("focus", query.focus);
    return (
      <CircleDestination
        circleId={query.circle}
        destination={`/posts/${kind}/${encodeURIComponent(id)}?${destination}`}
      />
    );
  }
  const circleId = membership.circleId;
  const feed = await getFeedPage({
    viewerId: session.user.id,
    circleId,
    proofIds: kind === "proof" ? [id] : [],
    checkInIds: kind === "check-in" ? [id] : [],
    includeReplaced: true,
  });
  const post = feed.items[0];
  if (!post) notFound();
  if (post.kind === "check-in") {
    const update = await getPrisma().checkInUpdate.findFirst({
      where: { id, circleId },
      include: {
        replies: replyInclude,
        checkIn: { include: { replies: replyInclude } },
      },
    });
    if (!update) notFound();
    return (
      <>
        <BackButton />
        <h1 className="sr-only">{post.author.name}’s check-in</h1>
        <PostCard post={post} detail />
        <section id="comments" className="scroll-mt-6">
          <h2 className="mb-4 text-base font-semibold">Comments</h2>
          <SocialReplyThread
            key={id}
            targetType="CHECK_IN_UPDATE"
            targetId={id}
            initialReplies={update.replies.map(toThreadReply)}
            currentUserId={session.user.id}
            contextLabel={`Commenting on ${post.author.name}’s check-in`}
            replyLabel="Add a comment"
            defaultExpanded
            scrollOnExpand={false}
          />
        </section>
        {update.checkIn.replies.length > 0 && (
          <section id="legacy-discussion" className="post-detail-section">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" />
              Earlier daily discussion
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              These comments belonged to the whole day before check-ins had
              separate discussions.
            </p>
            <SocialReplyThread
              targetType="CHECK_IN"
              targetId={update.checkInId}
              initialReplies={update.checkIn.replies.map(toThreadReply)}
              currentUserId={session.user.id}
              contextLabel="Earlier daily discussion"
              defaultExpanded={query.discussion === "legacy"}
              scrollOnExpand={false}
            />
          </section>
        )}
      </>
    );
  }
  const proof = await getPrisma().taskProof.findFirst({
    where: { id, circleId },
    include: {
      replies: replyInclude,
      replaces: { select: { id: true } },
      reviews: {
        orderBy: { createdAt: "asc" },
        include: {
          reviewer: { select: { id: true, name: true } },
          replies: replyInclude,
        },
      },
    },
  });
  if (!proof) notFound();
  const stalled =
    proof.aiStatus === "PENDING" &&
    Date.now() - proof.submittedAt.getTime() > 120_000;
  return (
    <>
      <BackButton />
      <h1 className="sr-only">{post.title}</h1>
      {proof.replacedById && (
        <Alert>
          <AlertTitle>Earlier proof</AlertTitle>
          <AlertDescription>
            This attempt was replaced.
            <Link
              className="underline"
              href={postHref(circleId, "proof", proof.replacedById)}
            >
              View the replacement
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <PostCard post={post} detail />
      <section className="post-detail-section">
        <h2 className="mb-2 text-base font-semibold">What counts as done</h2>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {post.definitionOfDone}
        </p>
        {proof.replaces && (
          <Button
            nativeButton={false}
            variant="link"
            className="mt-3 px-0"
            render={
              <Link href={postHref(circleId, "proof", proof.replaces.id)} />
            }
          >
            View earlier attempt
          </Button>
        )}
      </section>
      <section className="post-detail-section">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bot className="size-4" />
            AI’s take
          </h2>
          <span className="text-xs text-muted-foreground">
            A friend makes the call
          </span>
        </div>
        {proof.aiStatus === "SUCCEEDED" ? (
          <div className="flex flex-col gap-3 text-sm leading-relaxed">
            {proof.aiOneLiner && (
              <p className="font-medium">{proof.aiOneLiner}</p>
            )}
            {[
              { label: "Visible evidence", value: proof.aiVisibleEvidence },
              { label: "Task match", value: proof.aiTaskMatch },
              { label: "Uncertainty", value: proof.aiUncertainty },
              { label: "Worth checking", value: proof.aiReviewerQuestion },
            ]
              .filter((item) => item.value)
              .map((item) => (
                <p
                  key={item.label}
                  className="whitespace-pre-wrap text-muted-foreground"
                >
                  <span className="font-medium text-foreground">
                    {item.label}:{" "}
                  </span>
                  {item.value}
                </p>
              ))}
          </div>
        ) : proof.aiStatus === "FAILED" || stalled ? (
          <AiRetryButton proofId={id} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Reading the evidence. Your friends can review it already.
          </p>
        )}
      </section>
      {proof.reviews.length > 0 && (
        <section id="verdicts" className="post-detail-section">
          <h2 className="mb-4 text-base font-semibold">Verdicts</h2>
          <ProofReviewList
            reviews={proof.reviews.map((review) => ({
              id: review.id,
              decision: review.decision,
              note: review.note,
              reviewerId: review.reviewerId,
              reviewerName: review.reviewer.name,
              replies: review.replies.map(toThreadReply),
            }))}
            currentUserId={session.user.id}
            focusId={typeof query.focus === "string" ? query.focus : undefined}
          />
        </section>
      )}
      <section id="comments" className="scroll-mt-6">
        <h2 className="mb-4 text-base font-semibold">Comments</h2>
        <SocialReplyThread
          key={id}
          targetType="PROOF"
          targetId={id}
          initialReplies={proof.replies.map(toThreadReply)}
          currentUserId={session.user.id}
          contextLabel={`Commenting on ${post.title}`}
          replyLabel="Add a comment"
          defaultExpanded
          scrollOnExpand={false}
        />
      </section>
    </>
  );
}
