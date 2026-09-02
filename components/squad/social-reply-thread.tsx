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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

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
    <Item size="xs">
      <ItemMedia>
        <Avatar className="size-6 ring-1 ring-border">
          <AvatarImage src={reply.author.image ?? undefined} alt="" />
          <AvatarFallback>{reply.author.initials}</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <span className="truncate">{reply.author.name}</span>
          <time
            dateTime={reply.createdAt}
            className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums"
          >
            {replyTimeFormatter.format(new Date(reply.createdAt))}
          </time>
        </ItemTitle>
        <ItemDescription className="line-clamp-none whitespace-pre-wrap break-words text-foreground">
          {reply.body}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

export function SocialReplyThread({
  targetType,
  targetId,
  initialReplies,
}: {
  targetType: ReplyTargetType;
  targetId: string;
  initialReplies: SocialReply[];
}) {
  const router = useRouter();
  const generatedId = useId();
  const threadId = `reply-thread-${generatedId.replaceAll(":", "")}`;
  const inputId = `${threadId}-input`;
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState(initialReplies);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(result.error ?? "Reply failed.");
        return;
      }

      setReplies((current) => [...current, result.reply as SocialReply]);
      setBody("");
      toast.add({ title: "Reply posted.", type: "success" });
      router.refresh();
    } catch {
      setError("Could not post the reply. Try again.");
    } finally {
      setPending(false);
    }
  }

  const latestReply = replies.at(-1);
  const replyLabel =
    replies.length === 0
      ? "Reply"
      : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`;

  return (
    <div className="flex basis-full flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-expanded={open}
        aria-controls={threadId}
        onClick={() => setOpen((current) => !current)}
      >
        <MessageCircle data-icon="inline-start" />
        {replyLabel}
      </Button>

      {!open && latestReply && (
        <ItemGroup className="gap-1">
          <ReplyItem reply={latestReply} />
        </ItemGroup>
      )}

      {open && (
        <div
          id={threadId}
          className="flex w-full flex-col gap-2 rounded-lg border bg-muted/40 p-2"
        >
          {" "}
          {replies.length > 0 && (
            <ItemGroup className="gap-1" aria-live="polite">
              {replies.map((reply) => (
                <ReplyItem key={reply.id} reply={reply} />
              ))}
            </ItemGroup>
          )}
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
                  placeholder="Say something useful (or at least funny)"
                  aria-invalid={Boolean(error)}
                  disabled={pending}
                  className="min-h-16"
                />
                <FieldError>{error}</FieldError>
              </Field>
              <Field orientation="horizontal" className="justify-end">
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
                  Post reply
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </div>
      )}
    </div>
  );
}
