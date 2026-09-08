"use client";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useRefreshVersion } from "@/components/layout/app-refresh-provider";
import { useSocial } from "@/components/social/social-provider";
import {
  SocialReplyThread,
  type ThreadReply,
} from "@/components/squad/social-reply-thread";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

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
  const version = useRefreshVersion();
  // biome-ignore lint/correctness/useExhaustiveDependencies: Refreshes and retries reload this discussion.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(false);
    fetch(
      `/api/replies?${new URLSearchParams({ targetType: "COMMITMENT", targetId: taskId })}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setReplies(data.replies);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [taskId, open, version, attempt]);
  return (
    <div className="mt-3">
      <Button
        variant="ghost"
        size="sm"
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
          ) : replies ? (
            <SocialReplyThread
              targetType="COMMITMENT"
              targetId={taskId}
              initialReplies={replies}
              currentUserId={viewer.id}
              contextLabel={`Discussing ${title}`}
              replyLabel="Add a comment"
              defaultExpanded
              scrollOnExpand={false}
            />
          ) : (
            <Spinner />
          )}
        </div>
      )}
    </div>
  );
}
