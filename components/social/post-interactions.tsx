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
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { appFetch } from "@/lib/app-refresh";
import { memberHref, postHref } from "@/lib/navigation";
import type { FeedPost } from "@/lib/social-types";

async function copyPostLink(post: FeedPost) {
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

export function PostMenu({ post }: { post: FeedPost }) {
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
  post: FeedPost;
  onChange?: (patch: Partial<FeedPost>) => void;
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
  post: FeedPost;
  viewerId: string;
  count: number;
  onOpenChange?: (open: boolean) => void;
  onCountChange: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<ThreadReply[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const targetType = post.kind === "proof" ? "PROOF" : "CHECK_IN_UPDATE";
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries a failed comments request
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setReplies(null);
    setError(false);
    const query = new URLSearchParams({ targetType, targetId: post.id });
    void fetch(`/api/replies?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Comments failed");
        const data: { replies: ThreadReply[] } = await response.json();
        if (!controller.signal.aborted) setReplies(data.replies);
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
          <DialogTitle>Comments</DialogTitle>
          <DialogDescription>
            {post.author.name} ·{" "}
            {post.kind === "proof" ? post.title : "Check-in"}
          </DialogDescription>
        </DialogHeader>
        {error ? (
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
        ) : replies ? (
          <SocialReplyThread
            targetType={targetType}
            targetId={post.id}
            initialReplies={replies}
            currentUserId={viewerId}
            contextLabel="Visible to everyone in your circle"
            replyLabel="Add a comment"
            defaultExpanded
            scrollOnExpand={false}
            onReplyCountChange={onCountChange}
          />
        ) : (
          <output className="flex items-center gap-2 py-8">
            <Spinner />
            Loading comments
          </output>
        )}
        <Button
          nativeButton={false}
          variant="link"
          className="justify-self-start"
          render={
            <Link
              href={`${postHref(post.circleId, post.kind, post.id)}#comments`}
            />
          }
        >
          Open full post
          <ExternalLink data-icon="inline-end" />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
