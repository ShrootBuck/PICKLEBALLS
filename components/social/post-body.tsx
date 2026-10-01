"use client";

import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { MediaGallery } from "@/components/media/media-gallery";
import { ImpactList } from "@/components/mood/mood-display";
import { MoodShape } from "@/components/mood/mood-shape";
import { Badge } from "@/components/ui/badge";
import {
  formatFeelings,
  moodLevelLabel,
  moodStyle,
  postValence,
} from "@/lib/mood";
import { postHref } from "@/lib/navigation";
import type { CheckInPost, InteractivePost } from "@/lib/social-types";

function CheckInBody({ post }: { post: CheckInPost }) {
  const valence = postValence(post);
  const feelings = post.feelings ?? [];
  return (
    <div
      className="flex flex-col"
      style={valence == null ? undefined : moodStyle(valence)}
    >
      {valence == null ? (
        <Badge className="w-fit" variant="secondary">
          Check-in
        </Badge>
      ) : (
        <div className="mood-post-head">
          <MoodShape valence={valence} size={46} />
          <div className="min-w-0">
            <p className="mood-post-level">{moodLevelLabel(valence)}</p>
            {feelings.length > 0 && (
              <p className="mood-post-feelings">{formatFeelings(feelings)}</p>
            )}
          </div>
        </div>
      )}
      <ImpactList ids={post.impacts ?? []} className="mt-3" />
      {!!post.mediaIds?.length && (
        <div className="feed-media mt-4">
          <MediaGallery ids={post.mediaIds} />
        </div>
      )}
      {post.body && post.prompt && (
        <p className="mood-post-prompt">{post.prompt}</p>
      )}
      {(post.body || valence == null) && (
        <p
          className="social-check-in whitespace-pre-wrap break-words"
          data-prompted={post.body && post.prompt ? true : undefined}
        >
          {post.body || "Taking a moment to check in."}
        </p>
      )}
    </div>
  );
}

export function PostBody({ post }: { post: InteractivePost }) {
  const href = postHref(post.circleId, post.kind, post.id);
  return (
    <>
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
                post.expired
                  ? "destructive"
                  : post.reviewStatus === "APPROVED"
                    ? "success"
                    : post.reviewStatus === "CHALLENGED"
                      ? "destructive"
                      : "secondary"
              }
            >
              {post.expired ? (
                "Expired"
              ) : post.reviewStatus === "APPROVED" ? (
                <>
                  <BadgeCheck data-icon="inline-start" /> Verified
                </>
              ) : post.reviewStatus === "CHALLENGED" ? (
                "Challenged"
              ) : (
                `${post.approvalCount}/${post.requiredApprovals} approvals`
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
        <CheckInBody post={post} />
      )}
    </>
  );
}
