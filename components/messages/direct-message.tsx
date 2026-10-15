"use client";

import { SmilePlus } from "lucide-react";
import { useState } from "react";
import { MediaGallery } from "@/components/media/media-gallery";
import { MessageSenderAvatar } from "@/components/messages/message-sender-avatar";
import { DeleteAction } from "@/components/settings/delete-action";
import { Attachment } from "@/components/ui/attachment";
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble";
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
} from "@/lib/direct-message-types";
import { cn } from "@/lib/utils";

export function DirectMessage({
  message,
  conversationId,
  viewerId,
  peerName,
  group,
  onUpdate,
  refresh,
  receipt,
}: {
  message: DirectMessageItem;
  conversationId: string;
  viewerId: string;
  peerName: string;
  group: boolean;
  onUpdate: (message: DirectMessageItem) => void;
  refresh: () => void;
  receipt?: "Sent" | "Seen";
}) {
  const mine = message.senderId === viewerId;
  const align = mine ? "end" : "start";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const myReaction = message.reactions.find(
    (reaction) => reaction.userId === viewerId,
  )?.emoji;
  const reactions = [
    ...new Set(message.reactions.map((reaction) => reaction.emoji)),
  ];
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
  return (
    <Message align={align}>
      <MessageSenderAvatar sender={message.sender} />
      <MessageContent className="dm-message-content">
        <MessageHeader className={cn((!group || mine) && "sr-only")}>
          {mine ? "You" : (message.sender?.name ?? "Deleted member")}
        </MessageHeader>
        <Bubble variant={mine ? "default" : "secondary"} align={align}>
          {message.mediaIds.length > 0 && (
            <Attachment className="dm-attachment" state="done">
              <MediaGallery ids={message.mediaIds} compact />
            </Attachment>
          )}
          {(message.body || message.deletedAt) && (
            <BubbleContent>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {message.deletedAt ? "Message deleted" : message.body}
              </p>
            </BubbleContent>
          )}
          {reactions.length > 0 && (
            <BubbleReactions side="bottom" align={align}>
              {reactions.map((emoji) => (
                <Button
                  key={emoji}
                  variant={myReaction === emoji ? "secondary" : "ghost"}
                  size="xs"
                  aria-label={`${emoji} reaction${myReaction === emoji ? ", remove yours" : ", react"}`}
                  aria-pressed={myReaction === emoji}
                  disabled={busy}
                  onClick={() => void react(emoji)}
                >
                  <span>{emoji}</span>
                  <span>
                    {
                      message.reactions.filter(
                        (reaction) => reaction.emoji === emoji,
                      ).length
                    }
                  </span>
                </Button>
              ))}
            </BubbleReactions>
          )}
        </Bubble>
        <MessageFooter className={cn("gap-2", reactions.length > 0 && "mt-8")}>
          <time
            dateTime={message.createdAt}
            title={new Date(message.createdAt).toLocaleString()}
          >
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
          {receipt && !message.deletedAt && (
            <span
              title={
                receipt === "Seen" ? `Seen by ${peerName}` : "Message sent"
              }
            >
              {receipt}
            </span>
          )}
          {!message.deletedAt && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="React to message"
                  />
                }
              >
                <SmilePlus />
              </PopoverTrigger>
              <PopoverContent side="top" align={align} className="w-auto">
                <PopoverTitle className="sr-only">
                  React to message
                </PopoverTitle>
                <div className="flex gap-1">
                  {directEmojis.map((emoji) => (
                    <Button
                      key={emoji}
                      variant={myReaction === emoji ? "secondary" : "ghost"}
                      size="icon-sm"
                      aria-label={`React ${emoji}`}
                      aria-pressed={myReaction === emoji}
                      disabled={busy}
                      onClick={() => void react(emoji)}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
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
              </PopoverContent>
            </Popover>
          )}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
