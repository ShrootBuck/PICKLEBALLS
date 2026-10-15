"use client";

import { CircleAlert, Film, ImageIcon } from "lucide-react";
import { UploadStatus } from "@/components/media/upload-status";
import { useMessages } from "@/components/messages/message-provider";
import { useObjectUrls } from "@/components/messages/use-object-urls";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import type { ThreadPlacement } from "@/lib/direct-message-types";
import type { OutgoingMessage } from "@/lib/message-outbox";

export function PendingMessage({
  item,
  placement,
}: {
  item: OutgoingMessage;
  placement: ThreadPlacement;
}) {
  const { store } = useMessages();
  const previews = useObjectUrls(item.files);
  const failed = item.state === "failed";
  const attachments = item.files.length || item.mediaIds?.length || 0;
  return (
    <Message
      align="end"
      className="dm-message"
      data-send-state={item.state}
      data-first={placement.first}
      data-last={placement.last}
    >
      <MessageContent className="dm-message-content">
        <div className="dm-bubble-row">
          <Bubble
            variant={failed ? "outline" : "default"}
            align="end"
            className="dm-bubble"
          >
            {attachments > 0 && (
              <div className="dm-part dm-pending-media">
                {item.files.length
                  ? item.files.map((file, index) => (
                      <span
                        key={`${index}-${file.name}`}
                        className="dm-pending-file"
                        title={file.name}
                      >
                        {previews[index] ? (
                          // biome-ignore lint/performance/noImgElement: local attachment preview
                          <img src={previews[index]} alt="" />
                        ) : file.type.startsWith("video/") ? (
                          <Film aria-hidden="true" />
                        ) : (
                          <ImageIcon aria-hidden="true" />
                        )}
                        <span className="sr-only">{file.name}</span>
                      </span>
                    ))
                  : `${attachments} ${attachments === 1 ? "attachment" : "attachments"}`}
              </div>
            )}
            {item.body && (
              <BubbleContent className="dm-part">
                <p className="dm-text">{item.body}</p>
              </BubbleContent>
            )}
          </Bubble>
        </div>
        <MessageFooter className="dm-receipt dm-send-status">
          <output aria-live="polite" data-failed={failed || undefined}>
            {item.state === "sending" && <Spinner />}
            {failed && <CircleAlert aria-hidden="true" />}
            {failed
              ? "Not sent"
              : item.state === "queued"
                ? "Waiting to send"
                : "Sending…"}
          </output>
          {failed && (
            <>
              <Button
                size="xs"
                variant="secondary"
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
          <p role="alert" className="dm-send-error">
            {item.status}
          </p>
        ) : (
          item.files.length > 0 &&
          item.state === "sending" && (
            <div className="dm-upload">
              <UploadStatus status={item.status} percent={item.percent} />
            </div>
          )
        )}
      </MessageContent>
    </Message>
  );
}
