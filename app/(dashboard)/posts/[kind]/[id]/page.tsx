import { History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDestination } from "@/components/circles/circle-destination";
import { BackButton } from "@/components/social/back-button";
import { PostCard } from "@/components/social/post-card";
import { toThreadReply } from "@/components/squad/proof-helpers";
import { SocialReplyThread } from "@/components/squad/social-reply-thread";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@/generated/prisma/client";
import { likeInclude } from "@/lib/like-summary";
import { postHref } from "@/lib/navigation";
import { getPrisma } from "@/lib/prisma";
import { getProofDiscussion } from "@/lib/proof-discussion";
import { requirePageMembership } from "@/lib/request";
import { getFeedPage, socialAuthorSelect } from "@/lib/social-data";

export const metadata: Metadata = { title: "Post" };

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
  const replyInclude = {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    include: {
      ...likeInclude(session.user.id),
      author: { select: socialAuthorSelect },
    },
  } satisfies Prisma.SocialReplyFindManyArgs;
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
  if (!post || post.kind === "screen-time") notFound();
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
            composerVisible
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
      replaces: { select: { id: true } },
    },
  });
  if (!proof) notFound();
  const discussion = await getProofDiscussion(
    circleId,
    id,
    undefined,
    session.user.id,
  );
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
      <section id="comments" className="scroll-mt-6">
        <h2 className="mb-4 text-base font-semibold">Comments</h2>
        <SocialReplyThread
          key={id}
          targetType="PROOF"
          targetId={id}
          initialReplies={discussion.replies}
          initialVerdicts={discussion.verdicts}
          initialHasMore={discussion.hasMore}
          focusId={typeof query.focus === "string" ? query.focus : undefined}
          currentUserId={session.user.id}
          contextLabel={`Commenting on ${post.title}`}
          replyLabel="Add a comment"
          defaultExpanded
          composerVisible
          scrollOnExpand={false}
        />
      </section>
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
    </>
  );
}
