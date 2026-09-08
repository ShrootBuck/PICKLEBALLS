"use client";

import { BadgeCheck, Heart, MessageCircle, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MediaGallery } from "@/components/media/media-gallery";
import { useSocial } from "@/components/social/social-provider";
import { ReviewProof } from "@/components/squad/review-proof";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import { memberHref, postHref } from "@/lib/navigation";
import type { FeedPost } from "@/lib/social-types";
import { formatReplyTime } from "@/lib/time";

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
  const [like, setLike] = useState({
    likeCount: post.likeCount,
    likedByMe: post.likedByMe,
  });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    // Post details may be outside the feed's first page. Keep every cached copy
    // current when a verdict or comment refreshes the detail route.
    if (detail) patchPost(post, post);
  }, [detail, post, patchPost]);
  useEffect(() => {
    if (!inFlight.current)
      setLike({ likeCount: post.likeCount, likedByMe: post.likedByMe });
  }, [post.likeCount, post.likedByMe]);
  const href = postHref(post.circleId, post.kind, post.id);
  const authorHref =
    post.author.id === viewer.id
      ? "/profile"
      : memberHref(post.circleId, post.author.id);
  async function toggleLike() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const previous = like;
    const liked = !previous.likedByMe;
    setLike({
      likedByMe: liked,
      likeCount: Math.max(0, previous.likeCount + (liked ? 1 : -1)),
    });
    try {
      const response = await appFetch("/api/likes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: post.kind === "proof" ? "PROOF" : "CHECK_IN_UPDATE",
          targetId: post.id,
          liked,
        }),
      });
      if (!response.ok) throw new Error("Like failed");
      const result: { likeCount: number; likedByMe: boolean } =
        await response.json();
      setLike(result);
      patchPost(post, result);
      onChange?.(result);
    } catch {
      setLike(previous);
      toast.add({
        title: "Could not save your like. Try again.",
        type: "error",
      });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <article
      className="social-post"
      aria-label={`${post.author.name}’s ${post.kind === "proof" ? "proof" : "check-in"}`}
    >
      <header className="social-post-header">
        <Link href={authorHref} aria-label={`${post.author.name}’s profile`}>
          <Avatar className="size-11">
            <AvatarImage src={post.author.image ?? undefined} alt="" />
            <AvatarFallback>{post.author.initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={authorHref} className="social-post-heading">
            {post.author.name}
          </Link>
          <p className="social-post-meta">
            <Link href={href}>
              <time dateTime={post.createdAt}>
                {formatReplyTime(post.createdAt)}
              </time>
            </Link>
            {post.kind === "check-in" && " · Check-in"}
          </p>
        </div>
        {!detail && (
          <Button
            nativeButton={false}
            variant="ghost"
            size="icon-sm"
            aria-label="Open post details"
            render={<Link href={href} />}
          >
            <MoreHorizontal />
          </Button>
        )}
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={like.likedByMe ? "Unlike post" : "Like post"}
            aria-pressed={like.likedByMe}
            disabled={busy}
            onClick={toggleLike}
          >
            <Heart
              data-icon="inline-start"
              fill={like.likedByMe ? "currentColor" : "none"}
            />
            <span className="tabular-nums">{like.likeCount || "Like"}</span>
          </Button>
          <Button
            nativeButton={false}
            variant="ghost"
            size="sm"
            render={<Link href={`${href}#comments`} />}
            aria-label={`Open ${post.commentCount} comments`}
          >
            <MessageCircle data-icon="inline-start" />
            <span className="tabular-nums">
              {post.commentCount || "Comment"}
            </span>
          </Button>
        </div>
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
