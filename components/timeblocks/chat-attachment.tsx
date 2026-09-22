"use client";

import type { FileUIPart } from "ai";
import { FileText, X } from "lucide-react";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment";

export function ChatAttachment({
  part,
  state = "done",
  error,
  onRemove,
}: {
  part: FileUIPart;
  state?: "uploading" | "error" | "done";
  error?: string;
  onRemove?: () => void;
}) {
  const image = part.mediaType.startsWith("image/");
  const playable =
    part.mediaType.startsWith("audio/") || part.mediaType.startsWith("video/");
  return (
    <Attachment state={state} className="max-w-full">
      <AttachmentMedia variant={image && state === "done" ? "image" : "icon"}>
        {image && state === "done" ? (
          // Authenticated file routes redirect to short-lived private storage URLs.
          // biome-ignore lint/performance/noImgElement: private original attachment thumbnail
          <img src={part.url} alt={part.filename || "Attached image"} />
        ) : (
          <FileText />
        )}
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>{part.filename || "Attachment"}</AttachmentTitle>
        <AttachmentDescription>
          {error || (state === "uploading" ? "Uploading…" : part.mediaType)}
        </AttachmentDescription>
      </AttachmentContent>
      {state === "done" && !playable && (
        <AttachmentTrigger
          aria-label={`Open ${part.filename || "attachment"}`}
          render={
            <a
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${part.filename || "attachment"}`}
            >
              <span className="sr-only">Open attachment</span>
            </a>
          }
        />
      )}
      {onRemove && (
        <AttachmentActions>
          <AttachmentAction
            type="button"
            aria-label={`Remove ${part.filename}`}
            onClick={onRemove}
          >
            <X />
          </AttachmentAction>
        </AttachmentActions>
      )}
      {state === "done" && playable && (
        <div className="w-full min-w-0">
          {part.mediaType.startsWith("audio/") ? (
            <audio controls preload="none" src={part.url} className="w-full">
              <track kind="captions" />
            </audio>
          ) : (
            <video
              controls
              preload="metadata"
              src={part.url}
              className="max-h-52 w-full rounded-md"
            >
              <track kind="captions" />
            </video>
          )}
        </div>
      )}
    </Attachment>
  );
}
