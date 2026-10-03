"use client";

import { BadgeCheck, Trophy } from "lucide-react";
import Link from "next/link";
import { MediaGallery } from "@/components/media/media-gallery";
import { ImpactList } from "@/components/mood/mood-display";
import { MoodShape } from "@/components/mood/mood-shape";
import {
  countLabel,
  daysLabel,
  totalsParts,
} from "@/components/streaks/streak-text";
import { StreakEmber } from "@/components/streaks/streak-visuals";
import { Badge } from "@/components/ui/badge";
import {
  formatFeelings,
  moodLevelLabel,
  moodStyle,
  postValence,
} from "@/lib/mood";
import { postHref, streakHref } from "@/lib/navigation";
import type {
  CheckInPost,
  InteractivePost,
  StreakPost,
} from "@/lib/social-types";

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

function StreakBody({ post }: { post: StreakPost }) {
  const href = streakHref(post.circleId, post.streakId);
  const quit = post.streakKind === "QUIT";
  const totals = totalsParts(post.streakKind, post, post.unitLabel);
  const name = (
    <Link
      href={href}
      className="text-[17px] font-semibold tracking-tight underline-offset-4 hover:underline"
    >
      <span aria-hidden="true" className="mr-1">
        {post.emoji}
      </span>{" "}
      {post.streakTitle}
    </Link>
  );
  if (post.event === "STARTED")
    return (
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-3xl"
        >
          {post.emoji}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Started a {quit ? "quit" : "build"} streak
          </p>
          {name}
          <p className="text-sm text-muted-foreground">
            Day one starts now. A little encouragement goes a long way.
          </p>
        </div>
      </div>
    );
  return (
    <div className="flex items-center gap-4">
      {post.event === "MILESTONE" ? (
        <StreakEmber count={post.count} size={64} />
      ) : (
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-muted">
          <Trophy className="size-7 text-primary" />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        {post.event === "MILESTONE" ? (
          <p className="flex items-baseline gap-2">
            <span className="streak-count">{post.count}</span>
            <span className="text-sm text-muted-foreground">
              {countLabel(post.streakKind, post.count)}
            </span>
          </p>
        ) : (
          <p className="text-xs font-medium text-muted-foreground">
            {post.count
              ? `Retired after ${daysLabel(post.count)}`
              : "Retired a streak"}
          </p>
        )}
        {name}
        {totals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {totals.map((part) => (
              <Badge key={part} variant="secondary">
                {part}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PostBody({ post }: { post: InteractivePost }) {
  if (post.kind === "streak") return <StreakBody post={post} />;
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
