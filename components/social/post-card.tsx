"use client";

import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { MediaGallery } from "@/components/media/media-gallery";
import {
  PostInteractions,
  PostMenu,
} from "@/components/social/post-interactions";
import { PostTimestamp } from "@/components/social/post-timestamp";
import { useSocial } from "@/components/social/social-provider";
import { StoryAvatar } from "@/components/social/story-avatar";
import { ReviewProof } from "@/components/squad/review-proof";
import { Badge } from "@/components/ui/badge";
import { memberHref, postHref } from "@/lib/navigation";
import type { FeedPost } from "@/lib/social-types";

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
      aria-label={`${post.author.name}’s ${post.kind === "proof" ? "proof" : "check-in"}`}
    >
      <header className="social-post-header">
        <StoryAvatar author={post.author} href={authorHref} />
        <div className="min-w-0 flex-1">
          <Link href={authorHref} className="social-post-heading">
            {post.author.name}
          </Link>
          <p className="social-post-meta">
            <Link href={href}>
              <PostTimestamp dateTime={post.createdAt} />
            </Link>
            {post.kind === "check-in" && " · Check-in"}
          </p>
        </div>
        <PostMenu post={post} />
      </header>
      {post.kind === "proof" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Link
              href={href}
              className="text-[17px] font-semibold tracking-tight"
            >
              {post.title}
            </Link>
            <Badge
              variant={
                post.reviewStatus === "APPROVED"
                  ? "success"
                  : post.reviewStatus === "CHALLENGED"
                    ? "destructive"
                    : "secondary"
              }
            >
              {post.reviewStatus === "APPROVED" ? (
                <>
                  <BadgeCheck data-icon="inline-start" /> Verified
                </>
              ) : post.reviewStatus === "CHALLENGED" ? (
                "Challenged"
              ) : (
                "Needs review"
              )}
            </Badge>
          </div>
          <div className="feed-media">
            <MediaGallery ids={post.mediaIds} legacyProofId={post.id} />
          </div>
          {post.body && <p className="social-post-caption">{post.body}</p>}
          {post.verifiedBy && post.reviewStatus === "APPROVED" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Verified by {post.verifiedBy}
            </p>
          )}
        </>
      ) : (
        <>
          <Badge
            className="w-fit"
            variant={
              ["NAY", "AT_RISK"].includes(post.signal) ? "outline" : "secondary"
            }
          >
            {["NAY", "AT_RISK"].includes(post.signal)
              ? "Needs a hand"
              : "Going well"}
          </Badge>
          <p className="social-check-in">
            {post.body ||
              (["NAY", "AT_RISK"].includes(post.signal)
                ? "Could use a little backup today."
                : "Showing up. Getting it done.")}
          </p>
        </>
      )}
      <footer className="social-post-actions">
        <PostInteractions post={post} onChange={onChange} />
        {post.kind === "proof" && post.canReview && (
          <ReviewProof
            proofId={post.id}
            taskTitle={post.title}
            requiredApprovals={post.requiredApprovals}
            definitionOfDone={post.definitionOfDone}
            evidence={
              <MediaGallery
                ids={post.mediaIds}
                legacyProofId={post.id}
                compact
              />
            }
            onReviewed={(_, decision) => {
              const patch = {
                canReview: false,
                reviewStatus: decision,
                verifiedBy: decision === "APPROVED" ? viewer.name : null,
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
