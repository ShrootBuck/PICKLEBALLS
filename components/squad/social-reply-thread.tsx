"use client";

import { MessageCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ReplyTargetType = "COMMITMENT" | "CHECK_IN";

type SocialReply = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    image: string | null;
    initials: string;
  };
};

const replyTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Phoenix",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function ReplyItem({ reply }: { reply: SocialReply }) {
  return (
    <div className="flex gap-2.5">
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={reply.author.image ?? undefined} alt="" />
        <AvatarFallback className="text-[11px]">
          {reply.author.initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 rounded-xl bg-background/70 px-3 py-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-semibold">{reply.author.name}</span>
          <time
            dateTime={reply.createdAt}
            className="shrink-0 text-[11px] text-muted-foreground tabular-nums"
          >
            {replyTimeFormatter.format(new Date(reply.createdAt))}
          </time>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug">
          {reply.body}
        </p>
      </div>
    </div>
  );
}

export function SocialReplyThread({
  targetType,
  targetId,
  initialReplies,
  compact = false,
}: {
  targetType: ReplyTargetType;
  targetId: string;
  initialReplies: SocialReply[];
  compact?: boolean;
}) {
  const router = useRouter();
  const generatedId = useId();
  const threadId = `reply-thread-${generatedId.replaceAll(":", "")}`;
  const inputId = `${threadId}-input`;
  const [replies, setReplies] = useState(initialReplies);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(initialReplies.length > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody || pending) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, body: trimmedBody }),
      });
      const result = (await response.json()) as {
        reply?: SocialReply;
        error?: string;
      };
      if (!response.ok || !result.reply) {
        setError(result.error ?? "Reply flopped. Try again.");
        return;
      }

      setReplies((current) => [...current, result.reply as SocialReply]);
      setBody("");
      router.refresh();
    } catch {
      setError("Could not post. Check your wifi and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-xl bg-muted/60 p-3">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <MessageCircle className="size-3.5" />
        {replies.length === 0
          ? "No replies yet."
          : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
        {replies.length === 0 && !expanded ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => setExpanded(true)}
          >
            <Send data-icon="inline-start" />
            Reply
          </Button>
        ) : null}
      </div>

      {replies.length > 0 ? (
        <div
          className={cn(
            "flex flex-col gap-2",
            compact && replies.length > 4
              ? "max-h-64 overflow-y-auto pr-1"
              : "",
          )}
          aria-live="polite"
        >
          {replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} />
          ))}
        </div>
      ) : null}

      {expanded || replies.length > 0 ? (
        <form onSubmit={submit} className="w-full">
          <FieldGroup className="gap-2">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={inputId} className="sr-only">
                Write a reply
              </FieldLabel>
              <Textarea
                id={inputId}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                maxLength={500}
                placeholder={
                  replies.length === 0
                    ? "Say something useful (or at least funny)"
                    : "Keep it going…"
                }
                aria-invalid={Boolean(error)}
                disabled={pending}
                autoFocus={replies.length === 0}
                className="min-h-11 resize-none bg-background py-2.5 text-sm"
                rows={1}
              />
              <FieldError>{error}</FieldError>
            </Field>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {body.trim().length}/500
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={pending || body.trim().length === 0}
              >
                {pending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Send data-icon="inline-start" />
                )}
                Reply
              </Button>
            </div>
          </FieldGroup>
        </form>
      ) : null}
    </div>
  );
}
