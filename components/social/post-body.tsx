"use client";

import { BadgeCheck } from "lucide-react";
import Link from "next/link";
import { MediaGallery } from "@/components/media/media-gallery";
import { Badge } from "@/components/ui/badge";
import { moodLabel } from "@/lib/mood";
import { postHref } from "@/lib/navigation";
import type { InteractivePost } from "@/lib/social-types";

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
        <>
          <Badge
            className="w-fit"
            variant={
              post.mood != null && post.mood < 3 ? "outline" : "secondary"
            }
          >
            {moodLabel(post.mood)}
          </Badge>
          {!!post.feelings?.length && (
            <ul aria-label="Feelings" className="mt-3 flex flex-wrap gap-2">
              {post.feelings.map((feeling) => (
                <li key={feeling}>
                  <Badge variant="outline">{feeling}</Badge>
                </li>
              ))}
            </ul>
          )}
          {!!post.mediaIds?.length && (
            <div className="feed-media mt-3">
              <MediaGallery ids={post.mediaIds} />
            </div>
          )}
          <p className="social-check-in whitespace-pre-wrap break-words">
            {post.body || "Taking a moment to check in."}
          </p>
        </>
      )}
    </>
  );
}
