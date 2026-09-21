"use client";

import {
  ChevronDown,
  Heart,
  MessageCircle,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { MediaGallery } from "@/components/media/media-gallery";
import { MediaPicker } from "@/components/media/media-picker";
import {
  UploadStatus,
  useUploadStatus,
} from "@/components/media/upload-status";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { appFetch } from "@/lib/app-refresh";
import { uploadMedia } from "@/lib/media-upload";
import { formatReplyTime } from "@/lib/time";

export type ThreadReply = {
  likeCount?: number;
  likedByMe?: boolean;
  verdict?: "APPROVED" | "CHALLENGED";
  replyContext?: string;
  mediaIds?: string[];
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

type ReplyTargetType =
  | "COMMITMENT"
  | "CHECK_IN"
  | "CHECK_IN_UPDATE"
  | "PROOF"
  | "REVIEW";

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
  onLiked,
}: {
  reply: SocialReply;
  mine: boolean;
  onEdited: (reply: SocialReply) => void;
  onDeleted: (id: string) => void;
  onLiked: (state: { likeCount: number; likedByMe: boolean }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editable = !reply.verdict && mine && withinEditWindow(reply.createdAt);
  const edited = reply.updatedAt != null && reply.updatedAt !== reply.createdAt;

  const [likePending, setLikePending] = useState(false);
  const likeLock = useRef(false);
  const [optimisticLike, setOptimisticLike] = useState<{
    likeCount: number;
    likedByMe: boolean;
  } | null>(null);
  const liked = optimisticLike?.likedByMe ?? reply.likedByMe ?? false;
  const likeCount = optimisticLike?.likeCount ?? reply.likeCount ?? 0;

  async function toggleLike() {
    if (likeLock.current) return;
    likeLock.current = true;
    setLikePending(true);
    setError(null);
    const next = !liked;
    setOptimisticLike({
      likedByMe: next,
      likeCount: Math.max(0, likeCount + (next ? 1 : -1)),
    });
    try {
      const response = await appFetch("/api/likes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType: reply.verdict ? "REVIEW" : "REPLY",
          targetId: reply.id,
          liked: next,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save your like. Try again.");
      onLiked(result);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save your like. Try again.",
      );
    } finally {
      setOptimisticLike(null);
      setLikePending(false);
      likeLock.current = false;
    }
  }

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
      const response = await appFetch(`/api/replies/${reply.id}`, {
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
      const response = await appFetch(`/api/replies/${reply.id}`, {
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
    <div
      id={reply.verdict ? `verdict-${reply.id}` : `reply-${reply.id}`}
      className="flex scroll-mt-6 gap-2.5"
    >
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={reply.author.image ?? undefined} alt="" />
        <AvatarFallback className="text-[11px]">
          {reply.author.initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="break-words text-[13px] font-medium">
            {reply.author.name}
          </span>
          {reply.verdict && (
            <Badge
              variant={reply.verdict === "APPROVED" ? "success" : "destructive"}
            >
              {reply.verdict === "APPROVED" ? "Approved" : "Challenged"}
            </Badge>
          )}
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
        {reply.replyContext && (
          <p className="mt-1 text-xs text-muted-foreground">
            {reply.replyContext}
          </p>
        )}
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
        {reply.mediaIds?.length ? <MediaGallery ids={reply.mediaIds} /> : null}
        {!editing && (
          <Button
            type="button"
            variant={liked ? "secondary" : "ghost"}
            size="sm"
            className="mt-1"
            aria-label={`${liked ? "Unlike" : "Like"} comment by ${reply.author.name}`}
            aria-pressed={liked}
            disabled={likePending}
            onClick={toggleLike}
          >
            <Heart
              data-icon="inline-start"
              fill={liked ? "currentColor" : "none"}
            />
            {liked ? "Liked" : "Like"}
            {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
          </Button>
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
  initialVerdicts,
  initialHasMore,
  focusId,
  compact = false,
  currentUserId,
  defaultExpanded = false,
  scrollOnExpand = true,
  composerVisible = false,
  contextLabel,
  replyLabel = targetType === "PROOF" ? "Comment on proof" : "Reply",
  onReplyCountChange,
  onDiscussionChange,
}: {
  targetType: ReplyTargetType;
  targetId: string;
  initialReplies: SocialReply[];
  initialVerdicts?: SocialReply[];
  initialHasMore?: boolean;
  focusId?: string;
  compact?: boolean;
  currentUserId?: string;
  defaultExpanded?: boolean;
  scrollOnExpand?: boolean;
  composerVisible?: boolean;
  contextLabel: string;
  replyLabel?: string;
  onReplyCountChange?: (delta: number) => void;
  onDiscussionChange?: (discussion: {
    replies: SocialReply[];
    verdicts: SocialReply[];
    hasMore: boolean;
  }) => void;
}) {
  const generatedId = useId();
  const threadId = `reply-thread-${generatedId.replaceAll(":", "")}`;
  const inputId = `${threadId}-input`;
  const [replies, setReplies] = useState(() => chronological(initialReplies));
  const [hasMore, setHasMore] = useState(
    initialHasMore ?? initialReplies.length === 50,
  );
  const [verdicts, setVerdicts] = useState(initialVerdicts ?? []);
  useEffect(() => {
    if (initialVerdicts) setVerdicts(initialVerdicts);
  }, [initialVerdicts]);
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
  const latestDiscussion = useRef({ replies, verdicts, hasMore });
  useEffect(() => {
    latestDiscussion.current = { replies, verdicts, hasMore };
  }, [replies, verdicts, hasMore]);
  useEffect(
    () => () => {
      onDiscussionChange?.(latestDiscussion.current);
    },
    [onDiscussionChange],
  );
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus, uploadPercent] = useUploadStatus();
  const uploadedIds = useRef<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [composing, setComposing] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [visibleCount, setVisibleCount] = useState(compact ? 4 : 8);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replyButtonRef = useRef<HTMLButtonElement>(null);
  const hiddenCount = Math.max(0, replies.length - visibleCount);
  const visibleReplies = chronological([
    ...replies.slice(-visibleCount),
    ...verdicts,
  ]);
  useEffect(() => {
    if (focusId)
      document
        .getElementById(`verdict-${focusId}`)
        ?.scrollIntoView({ block: "center" });
  }, [focusId]);

  useEffect(() => {
    if (expanded && composing) inputRef.current?.focus();
  }, [expanded, composing]);

  function openComposer() {
    // Mount during the tap so mobile browsers can open the keyboard.
    flushSync(() => {
      setExpanded(true);
      setComposing(true);
    });
    inputRef.current?.focus();
  }

  function toggleThread() {
    if (expanded && replies.length === 0) replyButtonRef.current?.focus();
    setExpanded((value) => !value);
    setComposing(false);
  }

  // Deep-linked threads (from the activity bell) open and scroll into view.
  useEffect(() => {
    if (defaultExpanded) {
      setExpanded(true);
      if (scrollOnExpand)
        anchorRef.current?.scrollIntoView({
          behavior: "instant",
          block: "center",
        });
    }
  }, [defaultExpanded, scrollOnExpand]);

  async function loadEarlier() {
    if (hiddenCount > 0) {
      setVisibleCount((count) => count + 10);
      return;
    }
    if (loadingEarlier || !replies[0]) return;
    setLoadingEarlier(true);
    setLoadError(null);
    try {
      const query = new URLSearchParams({
        targetType,
        targetId,
        before: replies[0].id,
      });
      const response = await appFetch(`/api/replies?${query}`);
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
      setVisibleCount((count) => count + result.replies.length);
    } catch {
      setLoadError("Could not load earlier replies. Try again.");
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedBody = body.trim();
    if ((!trimmedBody && !files.length) || pending) return;

    setPending(true);
    setError(null);
    try {
      const mediaIds =
        uploadedIds.current ??
        (files.length ? await uploadMedia(files, setUploadStatus) : []);
      uploadedIds.current = mediaIds;
      const response = await appFetch("/api/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          body: trimmedBody,
          mediaIds,
        }),
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
      onReplyCountChange?.(1);
      setVisibleCount((count) => count + 1);
      setBody("");
      setFiles([]);
      setShowAttachments(false);
      uploadedIds.current = null;
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not post. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={anchorRef}
      id={`thread-${targetId}`}
      className="flex w-full min-w-0 scroll-mt-20 flex-col"
    >
      {!composerVisible && (
        <div className="-ml-2 flex flex-wrap items-center gap-x-1 text-muted-foreground">
          {replies.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleThread}
              aria-expanded={expanded}
              aria-controls={threadId}
              aria-label={`${expanded ? "Hide" : "View"} ${replies.length}${hasMore ? "+" : ""} ${replies.length === 1 ? "reply" : "replies"}. ${contextLabel}`}
            >
              <MessageCircle data-icon="inline-start" />
              {replies.length}
              {hasMore ? "+" : ""} {replies.length === 1 ? "reply" : "replies"}
              <ChevronDown
                data-icon="inline-end"
                className={expanded ? "rotate-180" : undefined}
              />
            </Button>
          ) : null}
          <Button
            ref={replyButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            onClick={openComposer}
            aria-label={`${replyLabel}. ${contextLabel}`}
            aria-controls={threadId}
          >
            {replies.length === 0 ? (
              <MessageCircle data-icon="inline-start" />
            ) : null}
            <span className="truncate">{replyLabel}</span>
          </Button>
          {expanded && replies.length === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleThread}
              aria-expanded={expanded}
              aria-controls={threadId}
            >
              Hide
            </Button>
          ) : null}
        </div>
      )}

      <div id={threadId} hidden={!expanded}>
        {expanded ? (
          <div className="my-2 ml-1 flex min-w-0 flex-col gap-4 border-l-2 border-border pl-3 sm:pl-4">
            {!composing && !composerVisible ? (
              <p className="text-xs text-muted-foreground">{contextLabel}</p>
            ) : null}
            {hiddenCount > 0 || hasMore ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 w-fit"
                disabled={loadingEarlier}
                onClick={loadEarlier}
              >
                {loadingEarlier ? "Loading…" : "Load earlier replies"}
              </Button>
            ) : null}
            {loadError ? (
              <p role="alert" className="text-xs text-destructive">
                {loadError}
              </p>
            ) : null}
            {visibleReplies.length > 0 ? (
              <div className="flex flex-col gap-4" aria-live="polite">
                {visibleReplies.map((reply) => (
                  <ReplyItem
                    key={`${reply.verdict ? "verdict" : "reply"}-${reply.id}`}
                    reply={reply}
                    mine={
                      currentUserId != null && reply.author.id === currentUserId
                    }
                    onLiked={(state) => {
                      const update = (current: SocialReply[]) =>
                        current.map((item) =>
                          item.id === reply.id ? { ...item, ...state } : item,
                        );
                      if (reply.verdict) setVerdicts(update);
                      else setReplies(update);
                    }}
                    onEdited={(updated) =>
                      setReplies((current) =>
                        current.map((item) =>
                          item.id === updated.id
                            ? { ...item, ...updated }
                            : item,
                        ),
                      )
                    }
                    onDeleted={(id) => {
                      setReplies((current) =>
                        current.filter((item) => item.id !== id),
                      );
                      onReplyCountChange?.(-1);
                    }}
                  />
                ))}
              </div>
            ) : null}

            {composing || composerVisible ? (
              <form onSubmit={submit} className="w-full">
                <FieldGroup className="gap-2">
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor={inputId}>{contextLabel}</FieldLabel>
                    <Textarea
                      id={inputId}
                      ref={inputRef}
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          !event.nativeEvent.isComposing &&
                          event.key === "Enter" &&
                          (event.metaKey || event.ctrlKey)
                        ) {
                          event.currentTarget.form?.requestSubmit();
                        }
                      }}
                      maxLength={500}
                      placeholder={
                        targetType === "PROOF"
                          ? "Write a comment…"
                          : "Write a reply…"
                      }
                      aria-invalid={Boolean(error)}
                      disabled={pending}
                      className="min-h-16 resize-none"
                      rows={1}
                    />
                    <FieldError>{error}</FieldError>
                  </Field>
                  {showAttachments ? (
                    <MediaPicker
                      files={files}
                      onChange={(next) => {
                        setFiles(next);
                        uploadedIds.current = null;
                      }}
                      disabled={pending}
                    />
                  ) : null}
                  {pending && uploadStatus ? (
                    <UploadStatus
                      status={uploadStatus}
                      percent={uploadPercent}
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setShowAttachments((value) => !value)}
                      aria-expanded={showAttachments}
                    >
                      <Paperclip data-icon="inline-start" />
                      {files.length ? `${files.length} attached` : "Attach"}
                    </Button>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {body.trim().length}/500
                    </span>
                    {!composerVisible && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setComposing(false);
                          if (replies.length === 0) setExpanded(false);
                          replyButtonRef.current?.focus();
                        }}
                      >
                        Close
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        pending ||
                        (body.trim().length === 0 && files.length === 0)
                      }
                    >
                      {pending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Send data-icon="inline-start" />
                      )}
                      {targetType === "PROOF" ? "Comment" : "Reply"}
                    </Button>
                  </div>
                </FieldGroup>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
