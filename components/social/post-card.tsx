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
import type { FeedPost } from "@/lib/social-types";

const postNoun = {
  proof: "proof",
  "check-in": "check-in",
  streak: "streak",
  "screen-time": "screen time",
} as const;

export function PostCard({
  post,
  detail = false,
  onChange,
}: {
  post: FeedPost;
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
      aria-label={`${post.author.name}’s ${postNoun[post.kind]}`}
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
            {post.kind === "screen-time" && " · Screen time"}
            {post.kind === "check-in" &&
              (post.valence != null ? " · Mood check-in" : " · Check-in")}
            {post.kind === "streak" &&
              (post.event === "STARTED"
                ? " · New streak"
                : post.event === "MILESTONE"
                  ? " · Streak milestone"
                  : " · Retired streak")}
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
                commentCount: post.commentCount + 1,
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
