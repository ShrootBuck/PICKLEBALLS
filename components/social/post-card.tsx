"use client";

import Link from "next/link";
import { useEffect } from "react";
import { MediaGallery } from "@/components/media/media-gallery";
import { PostAvatar } from "@/components/social/post-avatar";
import { PostBody } from "@/components/social/post-body";
import {
  PostInteractions,
  PostMenu,
} from "@/components/social/post-interactions";
import { PostTimestamp } from "@/components/social/post-timestamp";
import { useSocial } from "@/components/social/social-provider";
import { ReviewProof } from "@/components/squad/review-proof";
import { memberHref, postHref } from "@/lib/navigation";
import type {
  FeedPost,
  InteractivePost,
  ScreenTimePost,
} from "@/lib/social-types";

export function PostCard(props: {
  post: FeedPost;
  detail?: boolean;
  onChange?: (patch: Partial<FeedPost>) => void;
}) {
  return props.post.kind === "screen-time" ? (
    <ScreenTimeCard post={props.post} />
  ) : (
    <InteractivePostCard {...props} post={props.post} />
  );
}

function ScreenTimeCard({ post }: { post: ScreenTimePost }) {
  const { viewer } = useSocial();
  const authorHref =
    post.author.id === viewer.id
      ? "/profile"
      : memberHref(post.circleId, post.author.id);
  const hours = Math.floor(post.dailyAverageMinutes / 60);
  const minutes = post.dailyAverageMinutes % 60;
  return (
    <article
      className="social-post"
      aria-label={`${post.author.name}’s screen time`}
    >
      <header className="social-post-header">
        <PostAvatar author={post.author} href={authorHref} />
        <div className="min-w-0 flex-1">
          <Link href={authorHref} className="social-post-heading">
            {post.author.name}
          </Link>
          <p className="social-post-meta">
            <PostTimestamp dateTime={post.createdAt} /> · Screen time
          </p>
        </div>
      </header>
      <p className="mb-2 text-lg font-semibold">
        {hours > 0 ? `${hours}h ` : ""}
        {minutes}m daily average
      </p>
      <p className="mb-3 text-sm text-muted-foreground">
        Week of {post.weekStart}
      </p>
      <div className="feed-media">
        <MediaGallery ids={[post.mediaId]} />
      </div>
      <Link
        href={`${postHref(post.circleId, post.kind, post.id)}&week=${post.weekStart}`}
        className="mt-3 inline-block text-sm underline"
      >
        View screen-time leaderboard
      </Link>
    </article>
  );
}

function InteractivePostCard({
  post,
  detail = false,
  onChange,
}: {
  post: InteractivePost;
  detail?: boolean;
  onChange?: (patch: Partial<FeedPost>) => void;
}) {
  const { viewer, patchPost } = useSocial();
  useEffect(() => {
    // Post details may be outside the feed's first page. Keep every cached copy
    // current when a verdict or comment refreshes the detail route.
    if (detail) patchPost(post, post);
  }, [detail, post, patchPost]);
  const href = postHref(post.circleId, post.kind, post.id);
  const authorHref =
    post.author.id === viewer.id
      ? "/profile"
      : memberHref(post.circleId, post.author.id);
  return (
    <article
      className="social-post"
      aria-label={`${post.author.name}’s ${post.kind === "proof" ? "proof" : "check-in"}`}
    >
      <header className="social-post-header">
        <PostAvatar author={post.author} href={authorHref} />
        <div className="min-w-0 flex-1">
          <Link href={authorHref} className="social-post-heading">
            {post.author.name}
          </Link>
          <p className="social-post-meta">
            <Link href={href}>
              <PostTimestamp dateTime={post.createdAt} />
            </Link>
            {post.kind === "check-in" &&
              (post.mood ? " · Mood check-in" : " · Check-in")}
          </p>
        </div>
        <PostMenu post={post} />
      </header>
      <PostBody post={post} />
      <footer className="social-post-actions">
        <PostInteractions post={post} onChange={onChange} />
        {post.kind === "proof" && post.canReview && (
          <ReviewProof
            proofId={post.id}
            taskTitle={post.title}
            requiredApprovals={post.requiredApprovals}
            evidence={
              <MediaGallery
                ids={post.mediaIds}
                legacyProofId={post.id}
                compact
              />
            }
            onReviewed={(_, _decision, result) => {
              const patch = {
                canReview: false,
                reviewStatus: result.proofStatus,
                approvalCount: result.approvalCount,
                requiredApprovals: result.requiredApprovals,
                commentCount: post.commentCount + (result.hasComment ? 1 : 0),
              };
              patchPost(post, patch);
              onChange?.(patch);
            }}
          />
        )}
      </footer>
    </article>
  );
}
