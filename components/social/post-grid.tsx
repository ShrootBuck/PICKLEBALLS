"use client";

import { Camera, Heart, Layers, MessageCircle, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { postHref } from "@/lib/navigation";
import { type FeedPost, postKey } from "@/lib/social-types";
import { cn } from "@/lib/utils";

export function PostGrid({ posts }: { posts: FeedPost[] }) {
  return (
    <div className="profile-post-grid">
      {posts.map((post) => (
        <PostTile key={postKey(post)} post={post} />
      ))}
    </div>
  );
}

function PostTile({ post }: { post: FeedPost }) {
  const [failed, setFailed] = useState(false);
  const proof = post.kind === "proof";
  const video = proof && post.mediaIds[0]?.startsWith("v_");
  const src = proof
    ? post.mediaIds.length
      ? `/api/media/${post.mediaIds[0]}`
      : `/api/proofs/${post.id}/image`
    : null;
  return (
    <Link
      href={postHref(post.circleId, post.kind, post.id)}
      className={cn("profile-post-tile", !proof && "is-check-in")}
      aria-label={
        proof
          ? `${post.title}, ${post.reviewStatus === "APPROVED" ? "verified proof" : "proof"}`
          : `Check-in: ${post.body || "Showing up"}`
      }
    >
      {src && !failed ? (
        video ? (
          <video
            src={src}
            muted
            playsInline
            preload="metadata"
            className="profile-post-thumbnail"
            onError={() => setFailed(true)}
            aria-label={proof ? post.title : "Proof video"}
          />
        ) : (
          // biome-ignore lint/performance/noImgElement: private authenticated media
          <img
            src={src}
            alt=""
            loading="lazy"
            className="profile-post-thumbnail"
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <div className="profile-post-text">
          {proof ? (
            <Camera className="size-5" />
          ) : (
            <MessageCircle className="size-4" />
          )}
          <p className="line-clamp-5">
            {proof ? post.title : post.body || "Showing up. Getting it done."}
          </p>
        </div>
      )}
      {proof && (video || post.mediaIds.length > 1) && (
        <span className="profile-post-type">
          {video ? <Play className="size-4" /> : <Layers className="size-4" />}
        </span>
      )}
      <span className="profile-post-stats">
        <span>
          <Heart className="size-3" />
          {post.likeCount}
        </span>
        <span>
          <MessageCircle className="size-3" />
          {post.commentCount}
        </span>
      </span>
    </Link>
  );
}
