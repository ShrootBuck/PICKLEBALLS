"use client";

import { MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
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
import { formatReplyTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type ThreadReply = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  author: {
    id: string;
    name: string;
    image: string | null;
    initials: string;
  };
};

type ReplyTargetType = "COMMITMENT" | "CHECK_IN" | "PROOF" | "REVIEW";

type SocialReply = ThreadReply;

function chronological(replies: SocialReply[]) {
  return [...replies].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

const EDIT_WINDOW_MS = 10 * 60 * 1000;

function withinEditWindow(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() <= EDIT_WINDOW_MS;
}

function ReplyItem({
  reply,
  mine,
  onEdited,
  onDeleted,
}: {
  reply: SocialReply;
  mine: boolean;
  onEdited: (reply: SocialReply) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = mine && withinEditWindow(reply.createdAt);
  const edited = reply.updatedAt != null && reply.updatedAt !== reply.createdAt;

  async function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    if (trimmed === reply.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/replies/${reply.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const result = (await response.json()) as {
        reply?: SocialReply;
        error?: string;
      };
      if (!response.ok || !result.reply) {
        setError(result.error ?? "Edit flopped. Try again.");
        return;
      }
      onEdited(result.reply);
      setEditing(false);
    } catch {
      setError("Could not save. Check your wifi and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/replies/${reply.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setError(result.error ?? "Delete flopped. Try again.");
        return;
      }
      onDeleted(reply.id);
    } catch {
      setError("Could not delete. Check your wifi and try again.");
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

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
            {formatReplyTime(reply.createdAt)}
            {edited ? " · edited" : ""}
          </time>
          {editable && !editing ? (
            <span className="ml-auto flex basis-full items-center justify-end gap-1 sm:basis-auto">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 min-h-0 px-1.5 text-[11px]"
                onClick={() => {
                  setDraft(reply.body);
                  setEditing(true);
                }}
              >
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
              {confirmingDelete ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 min-h-0 px-1.5 text-[11px]"
                  disabled={busy}
                  onClick={remove}
                >
                  {busy ? <Spinner data-icon="inline-start" /> : null}
                  Sure?
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 min-h-0 px-1.5 text-[11px]"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              )}
            </span>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <Textarea
              aria-label="Edit reply"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={500}
              rows={2}
              disabled={busy}
              className="min-h-11 resize-none bg-background py-2 text-sm"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-7 min-h-0 text-xs"
                disabled={busy || draft.trim().length === 0}
                onClick={saveEdit}
              >
                {busy ? <Spinner data-icon="inline-start" /> : null}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 min-h-0 text-xs"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                  setDraft(reply.body);
                }}
              >
                <X data-icon="inline-start" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug">
            {reply.body}
          </p>
        )}
        {error && !editing ? (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

export function SocialReplyThread({
  targetType,
  targetId,
  initialReplies,
  compact = false,
  currentUserId,
  defaultExpanded = false,
}: {
  targetType: ReplyTargetType;
  targetId: string;
  initialReplies: SocialReply[];
  compact?: boolean;
  currentUserId?: string;
  defaultExpanded?: boolean;
}) {
  const router = useRouter();
  const generatedId = useId();
  const threadId = `reply-thread-${generatedId.replaceAll(":", "")}`;
  const inputId = `${threadId}-input`;
  const [replies, setReplies] = useState(() => chronological(initialReplies));
  const [hasMore, setHasMore] = useState(initialReplies.length === 50);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  useEffect(() => {
    const fresh = chronological(initialReplies);
    setReplies((current) => {
      const oldest = fresh[0];
      const older =
        fresh.length === 50 && oldest
          ? current.filter(
              (row) =>
                row.createdAt < oldest.createdAt ||
                (row.createdAt === oldest.createdAt && row.id < oldest.id),
            )
          : [];
      return [...older, ...fresh];
    });
    if (fresh.length < 50) setHasMore(false);
  }, [initialReplies]);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Deep-linked threads (from the activity bell) open and scroll into view.
  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true);
      anchorRef.current?.scrollIntoView({
        behavior: "instant",
        block: "center",
      });
    }
  }, [defaultExpanded]);

  async function loadEarlier() {
    if (loadingEarlier || !replies[0]) return;
    setLoadingEarlier(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        targetType,
        targetId,
        before: replies[0].id,
      });
      const response = await fetch(`/api/replies?${query}`);
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not load replies.");
      setReplies((current) =>
        chronological([
          ...new Map(
            [...result.replies, ...current].map((row: SocialReply) => [
              row.id,
              row,
            ]),
          ).values(),
        ]),
      );
      setHasMore(result.hasMore);
    } catch {
      setError("Could not load earlier replies. Try again.");
    } finally {
      setLoadingEarlier(false);
    }
  }

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
    <div
      ref={anchorRef}
      id={`thread-${targetId}`}
      className="flex w-full scroll-mt-20 flex-col gap-2.5 rounded-xl bg-muted/60 p-3"
    >
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <MessageCircle className="size-3.5 shrink-0" />
        {replies.length === 0
          ? "No replies yet. Talk shit."
          : `${replies.length}${hasMore ? "+" : ""} ${replies.length === 1 ? "reply" : "replies"}`}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7 min-h-0 text-xs"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide" : "Reply"}
        </Button>
      </div>

      {expanded ? (
        <>
          {hasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingEarlier}
              onClick={loadEarlier}
            >
              {loadingEarlier ? "Loading…" : "Load earlier replies"}
            </Button>
          ) : null}
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
                <ReplyItem
                  key={reply.id}
                  reply={reply}
                  mine={
                    currentUserId != null && reply.author.id === currentUserId
                  }
                  onEdited={(updated) =>
                    setReplies((current) =>
                      current.map((item) =>
                        item.id === updated.id ? updated : item,
                      ),
                    )
                  }
                  onDeleted={(id) =>
                    setReplies((current) =>
                      current.filter((item) => item.id !== id),
                    )
                  }
                />
              ))}
            </div>
          ) : null}

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
        </>
      ) : null}
    </div>
  );
}
