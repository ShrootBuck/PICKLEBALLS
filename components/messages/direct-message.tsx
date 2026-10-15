"use client";

import { Copy, SmilePlus } from "lucide-react";
import { useRef, useState } from "react";
import { MediaGallery } from "@/components/media/media-gallery";
import { MessageSenderAvatar } from "@/components/messages/message-sender-avatar";
import { DeleteAction } from "@/components/settings/delete-action";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { messageRequest, messagesChanged } from "@/lib/direct-message-client";
import {
  type DirectMessageItem,
  directEmojis,
  isEmojiOnly,
  type ThreadPlacement,
} from "@/lib/direct-message-types";
import { formatMessageClock, formatMessageTimestamp } from "@/lib/message-time";

// Touch screens have no hover, so a press and hold opens the message menu.
function useLongPress(open: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const touch = useRef(false);
  const fired = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = null;
  };
  return {
    onPointerDown(event: React.PointerEvent) {
      touch.current = event.pointerType !== "mouse";
      if (!touch.current) return;
      fired.current = false;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        open();
      }, 450);
    },
    onPointerMove(event: React.PointerEvent) {
      if (
        start.current &&
        Math.hypot(
          event.clientX - start.current.x,
          event.clientY - start.current.y,
        ) > 10
      )
        cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu(event: React.MouseEvent) {
      // Keep the browser's own menu for mouse users (copy, save image).
      if (!touch.current) return;
      event.preventDefault();
      cancel();
      open();
    },
    onClickCapture(event: React.MouseEvent) {
      // The finger lifting after a hold must not also open a photo.
      if (!fired.current) return;
      fired.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

export function DirectMessage({
  message,
  conversationId,
  viewerId,
  peerName,
  group,
  placement,
  timeZone,
  onUpdate,
  refresh,
  receipt,
}: {
  message: DirectMessageItem;
  conversationId: string;
  viewerId: string;
  peerName: string;
  group: boolean;
  placement: ThreadPlacement;
  timeZone: string;
  onUpdate: (message: DirectMessageItem) => void;
  refresh: () => void;
  receipt?: "Sent" | "Seen";
}) {
  const mine = message.senderId === viewerId;
  const align = mine ? "end" : "start";
  const deleted = Boolean(message.deletedAt);
  const bubble = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const press = useLongPress(() => setOpen(true));
  const myReaction = message.reactions.find(
    (reaction) => reaction.userId === viewerId,
  )?.emoji;
  const reactions = [
    ...new Set(message.reactions.map((reaction) => reaction.emoji)),
  ];
  const emoji =
    !deleted && !message.mediaIds.length && isEmojiOnly(message.body);
  const senderName = mine ? "You" : (message.sender?.name ?? "Deleted member");
  const showAvatar = group && !mine;
  const endpoint = `/api/messages/${conversationId}/${message.id}`;
  async function react(emoji: string) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await messageRequest<{ message: DirectMessageItem }>(
        endpoint,
        "PUT",
        { emoji: emoji === myReaction ? null : emoji },
      );
      onUpdate(result.message);
      setOpen(false);
    } catch (cause) {
      toast.add({
        title:
          cause instanceof Error ? cause.message : "Couldn't react. Try again.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(message.body);
      toast.add({ title: "Copied.", type: "success" });
    } catch {
      toast.add({ title: "Couldn't copy that message.", type: "error" });
    }
    setOpen(false);
  }
  return (
    <Message
      align={align}
      className="dm-message"
      data-first={placement.first}
      data-last={placement.last}
      data-menu-open={open || undefined}
    >
      {showAvatar &&
        (placement.last ? (
          <MessageSenderAvatar sender={message.sender} />
        ) : (
          <span className="dm-avatar-space" aria-hidden="true" />
        ))}
      <MessageContent className="dm-message-content">
        <MessageHeader
          className={
            group && !mine && placement.first ? "dm-sender" : "sr-only"
          }
        >
          {senderName}
        </MessageHeader>
        <div className="dm-bubble-row">
          <Bubble
            ref={bubble}
            variant={deleted ? "outline" : mine ? "default" : "secondary"}
            align={align}
            className="dm-bubble"
            data-emoji={emoji || undefined}
            data-deleted={deleted || undefined}
            {...(deleted ? {} : press)}
          >
            {!deleted && message.mediaIds.length > 0 && (
              <div className="dm-part dm-media">
                <MediaGallery ids={message.mediaIds} compact />
              </div>
            )}
            {(message.body || deleted) && (
              <BubbleContent className="dm-part">
                <p className="dm-text">
                  {deleted ? "Message deleted" : message.body}
                </p>
              </BubbleContent>
            )}
          </Bubble>
          <div className="dm-actions">
            {!deleted && (
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="dm-action"
                      aria-label="React to message"
                    />
                  }
                >
                  <SmilePlus />
                </PopoverTrigger>
                <PopoverContent
                  anchor={bubble}
                  side="top"
                  align={mine ? "end" : "start"}
                  sideOffset={6}
                  className="dm-menu"
                >
                  <PopoverTitle className="sr-only">
                    React to message
                  </PopoverTitle>
                  <div className="dm-menu-emoji">
                    {directEmojis.map((emoji) => (
                      <Button
                        key={emoji}
                        variant="ghost"
                        size="icon"
                        className="dm-menu-emoji-button"
                        aria-label={`React ${emoji}`}
                        aria-pressed={myReaction === emoji}
                        disabled={busy}
                        onClick={() => void react(emoji)}
                      >
                        {emoji}
                      </Button>
                    ))}
                  </div>
                  <p className="dm-menu-time">
                    {formatMessageTimestamp(message.createdAt, timeZone)}
                  </p>
                  {(message.body || mine) && (
                    <div className="dm-menu-actions">
                      {message.body && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void copy()}
                        >
                          <Copy data-icon="inline-start" />
                          Copy text
                        </Button>
                      )}
                      {mine && (
                        <DeleteAction
                          label="Delete message"
                          title="Delete this message?"
                          description="This removes the message and its attachments for everyone in this conversation."
                          endpoint={endpoint}
                          onDeleted={() => {
                            setOpen(false);
                            refresh();
                            messagesChanged();
                          }}
                        />
                      )}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            )}
            <time
              className="dm-time"
              dateTime={message.createdAt}
              title={formatMessageTimestamp(message.createdAt, timeZone)}
            >
              {formatMessageClock(message.createdAt, timeZone)}
            </time>
          </div>
        </div>
        {!deleted && reactions.length > 0 && (
          <div className="dm-reactions">
            {reactions.map((emoji) => {
              const count = message.reactions.filter(
                (reaction) => reaction.emoji === emoji,
              ).length;
              const yours = myReaction === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  className="dm-reaction pressable"
                  aria-label={`${emoji} reaction${yours ? ", remove yours" : ", react"}`}
                  aria-pressed={yours}
                  disabled={busy}
                  onClick={() => void react(emoji)}
                >
                  <span>{emoji}</span>
                  {count > 1 && <span className="tabular-nums">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
        {receipt && !deleted && (
          <MessageFooter
            className="dm-receipt"
            title={receipt === "Seen" ? `Seen by ${peerName}` : "Message sent"}
          >
            {receipt}
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  );
}
