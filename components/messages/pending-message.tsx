"use client";

import { ImagePlus } from "lucide-react";
import { UploadStatus } from "@/components/media/upload-status";
import { useMessages } from "@/components/messages/message-provider";
import { MessageSenderAvatar } from "@/components/messages/message-sender-avatar";
import { useSocial } from "@/components/social/social-provider";
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import type { OutgoingMessage } from "@/lib/message-outbox";

export function PendingMessage({ item }: { item: OutgoingMessage }) {
  const { store } = useMessages();
  const { viewer } = useSocial();
  const failed = item.state === "failed";
  return (
    <Message align="end" data-send-state={item.state}>
      <MessageSenderAvatar sender={viewer} />
      <MessageContent className="dm-message-content">
        <Bubble variant={failed ? "outline" : "default"} align="end">
          {item.body && (
            <BubbleContent>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {item.body}
              </p>
            </BubbleContent>
          )}
          {item.files.map((file, index) => (
            <Attachment
              key={`${index}-${file.name}`}
              size="sm"
              state={
                failed
                  ? "error"
                  : item.state === "sending"
                    ? "uploading"
                    : "idle"
              }
            >
              <AttachmentMedia>
                <ImagePlus />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{file.name}</AttachmentTitle>
              </AttachmentContent>
            </Attachment>
          ))}
          {!item.files.length && !!item.mediaIds?.length && (
            <BubbleContent>Attachments ({item.mediaIds.length})</BubbleContent>
          )}
        </Bubble>
        <MessageFooter className="flex-wrap gap-2">
          <output aria-live="polite" className="flex items-center gap-1.5">
            {item.state === "sending" && <Spinner />}
            {failed
              ? "Couldn't send"
              : item.state === "queued"
                ? "Waiting to send"
                : "Sending…"}
          </output>
          {failed && (
            <>
              <Button
                size="xs"
                variant="outline"
                onClick={() => store.retry(item.clientId)}
              >
                Retry send
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => store.dismiss(item.clientId)}
              >
                Dismiss
              </Button>
            </>
          )}
        </MessageFooter>
        {failed ? (
          <p
            role="alert"
            className="text-xs text-destructive [overflow-wrap:anywhere]"
          >
            {item.status}
          </p>
        ) : (
          item.files.length > 0 &&
          item.state === "sending" && (
            <UploadStatus status={item.status} percent={item.percent} />
          )
        )}
      </MessageContent>
    </Message>
  );
}
