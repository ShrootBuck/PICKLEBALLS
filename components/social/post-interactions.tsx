"use client";

import {
  Copy,
  ExternalLink,
  Heart,
  MessageCircle,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PostBody } from "@/components/social/post-body";
import { useSocial } from "@/components/social/social-provider";
import {
  SocialReplyThread,
  type ThreadReply,
} from "@/components/squad/social-reply-thread";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import { memberHref, postHref } from "@/lib/navigation";
import type { InteractivePost } from "@/lib/social-types";

async function copyPostLink(post: InteractivePost) {
  try {
    await navigator.clipboard.writeText(
      new URL(
        postHref(post.circleId, post.kind, post.id),
        window.location.origin,
      ).href,
    );
    toast.add({
      title: "Post link copied. Only people in this circle can open it.",
      type: "success",
    });
  } catch {
    toast.add({
      title: "Could not copy the link. Open the post to copy its address.",
      type: "error",
    });
  }
}

export function PostMenu({ post }: { post: InteractivePost }) {
  const { viewer } = useSocial();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Post options" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link href={postHref(post.circleId, post.kind, post.id)} />}
          >
            <ExternalLink />
            Open post
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void copyPostLink(post)}>
            <Copy />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                href={
                  post.author.id === viewer.id
                    ? "/profile"
                    : memberHref(post.circleId, post.author.id)
                }
              />
            }
          >
            <UserRound />
            View profile
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PostInteractions({
  post,
  onChange,
  onCommentsOpenChange,
}: {
  post: InteractivePost;
  onChange?: (patch: Partial<InteractivePost>) => void;
  onCommentsOpenChange?: (open: boolean) => void;
}) {
  const { viewer, patchPost } = useSocial();
  const [like, setLike] = useState({
    likeCount: post.likeCount,
    likedByMe: post.likedByMe,
  });
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  useEffect(() => {
    if (!inFlight.current)
      setLike({ likeCount: post.likeCount, likedByMe: post.likedByMe });
  }, [post.likeCount, post.likedByMe]);
  useEffect(() => setCommentCount(post.commentCount), [post.commentCount]);
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
      <PostComments
        key={`${post.kind}:${post.id}`}
        post={post}
        viewerId={viewer.id}
        count={commentCount}
        onOpenChange={onCommentsOpenChange}
        onCountChange={(delta) => {
          const count = Math.max(0, commentCount + delta);
          setCommentCount(count);
          patchPost(post, { commentCount: count });
          onChange?.({ commentCount: count });
        }}
      />
    </div>
  );
}

function PostComments({
  post,
  viewerId,
  count,
  onOpenChange,
  onCountChange,
}: {
  post: InteractivePost;
  viewerId: string;
  count: number;
  onOpenChange?: (open: boolean) => void;
  onCountChange: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [discussion, setDiscussion] = useState<{
    replies: ThreadReply[];
    verdicts?: ThreadReply[];
    hasMore: boolean;
  } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const targetType = post.kind === "proof" ? "PROOF" : "CHECK_IN_UPDATE";
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries a failed comments request
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(false);
    const query = new URLSearchParams({ targetType, targetId: post.id });
    void fetch(`/api/replies?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Comments failed");
        const data = await response.json();
        if (!controller.signal.aborted) setDiscussion(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [open, attempt, post.id, targetType]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        onOpenChange?.(value);
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Open ${count} comments`}
          />
        }
      >
        <MessageCircle data-icon="inline-start" />
        <span className="tabular-nums">{count || "Comment"}</span>
      </DialogTrigger>
      <DialogContent className="post-comments-dialog">
        <DialogHeader>
          <DialogTitle>
            {post.kind === "proof"
              ? "Proof and comments"
              : "Check-in and comments"}
          </DialogTitle>
          <DialogDescription>
            {post.author.name} ·{" "}
            {post.kind === "proof" ? post.title : "Check-in"}
          </DialogDescription>
        </DialogHeader>
        <div className="post-discussion-layout">
          <div className="post-discussion-body">
            <PostBody post={post} />
          </div>
          <section className="post-discussion-comments" aria-label="Comments">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  Could not load comments.{" "}
                  <Button
                    variant="link"
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {discussion ? (
              <SocialReplyThread
                targetType={targetType}
                targetId={post.id}
                initialReplies={discussion.replies}
                initialVerdicts={discussion.verdicts}
                initialHasMore={discussion.hasMore}
                onDiscussionChange={setDiscussion}
                currentUserId={viewerId}
                contextLabel="Visible to everyone in your circle"
                replyLabel="Add a comment"
                defaultExpanded
                composerVisible
                scrollOnExpand={false}
                onReplyCountChange={onCountChange}
              />
            ) : !error ? (
              <output className="flex min-h-64 flex-col gap-5">
                <span className="sr-only">Loading comments</span>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-4/5" />
                <Skeleton className="h-24 w-full" />
              </output>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
