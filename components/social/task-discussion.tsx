"use client";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useSocial } from "@/components/social/social-provider";
import {
  SocialReplyThread,
  type ThreadReply,
} from "@/components/squad/social-reply-thread";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { refreshEvent } from "@/lib/app-refresh";
import { watchRealtime } from "@/lib/watch-realtime";

export function TaskDiscussion({
  taskId,
  title,
  focused,
}: {
  taskId: string;
  title: string;
  focused?: boolean;
}) {
  const { viewer } = useSocial();
  const [open, setOpen] = useState(Boolean(focused));
  const [replies, setReplies] = useState<ThreadReply[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refreshes and retries reload this discussion.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(false);
    const live = watchRealtime(
      async () => {
        try {
          const response = await fetch(
            `/api/replies?${new URLSearchParams({ targetType: "COMMITMENT", targetId: taskId })}`,
            {
              cache: "no-store",
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(20_000),
              ]),
            },
          );
          if (!response.ok) throw new Error();
          const data = await response.json();
          if (!controller.signal.aborted) {
            setReplies(data.replies);
            setError(false);
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setError(true);
            throw error;
          }
        }
      },
      (event) => event.type === "refresh",
      [refreshEvent],
    );
    return () => {
      controller.abort();
      live.dispose();
    };
  }, [taskId, open, attempt]);
  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <MessageCircle data-icon="inline-start" />
        {open ? "Hide discussion" : "Discuss task"}
      </Button>
      {open && (
        <div className="mt-3">
          {error ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Could not load discussion. Retry
            </Button>
          ) : null}
          {replies ? (
            <SocialReplyThread
              targetType="COMMITMENT"
              targetId={taskId}
              initialReplies={replies}
              currentUserId={viewer.id}
              contextLabel={`Discussing ${title}`}
              replyLabel="Add a comment"
              defaultExpanded
              composerVisible
              scrollOnExpand={false}
            />
          ) : !error ? (
            <Spinner />
          ) : null}
        </div>
      )}
    </div>
  );
}
