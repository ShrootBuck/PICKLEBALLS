"use client";

import { ImagePlus, Send, X } from "lucide-react";
import {
  type MutableRefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  UploadStatus,
  useUploadStatus,
} from "@/components/media/upload-status";
import { useTypingSender } from "@/components/messages/use-typing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { holdAppRefresh } from "@/lib/app-refresh";
import { messageRequest, messagesChanged } from "@/lib/direct-message-client";
import type { DirectMessageItem } from "@/lib/direct-message-types";
import {
  maxMediaCount,
  mediaMimeType,
  uploadTicketSchema,
} from "@/lib/media-policy";
import { uploadMedia } from "@/lib/media-upload";

export type MessageDraft = { body: string; files: File[]; clientId: string };
export type MessageDrafts = MutableRefObject<Map<string, MessageDraft>>;

export function MessageComposer({
  id,
  name,
  group,
  drafts,
  onSent,
}: {
  id: string;
  name: string;
  group: boolean;
  drafts: MessageDrafts;
  onSent: (message: DirectMessageItem) => void;
}) {
  const fieldId = useId();
  const typing = useTypingSender(id);
  const [draft, setDraft] = useState<MessageDraft>(
    () =>
      drafts.current.get(id) ?? {
        body: "",
        files: [],
        clientId: crypto.randomUUID(),
      },
  );
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, updateStatus, percent] = useUploadStatus();
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    drafts.current.set(id, draft);
  }, [id, draft, drafts]);
  useEffect(() => {
    const urls = draft.files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [draft.files]);

  function change(next: Partial<MessageDraft>) {
    setDraft((current) => ({
      ...current,
      ...next,
      clientId: crypto.randomUUID(),
    }));
    setError("");
  }
  function addFiles(files: File[]) {
    if (sending.current || !files.length) return;
    if (draft.files.length + files.length > maxMediaCount) {
      setError("Attach up to six photos or videos at a time.");
      return;
    }
    if (
      files.some(
        (file) =>
          !uploadTicketSchema.safeParse({
            mimeType: mediaMimeType(file),
            sizeBytes: file.size,
          }).success,
      )
    ) {
      setError("Choose a photo up to 100 MB or a video up to 5 GB.");
      return;
    }
    change({ files: [...draft.files, ...files] });
  }
  async function send() {
    if (sending.current || (!draft.body.trim() && !draft.files.length)) return;
    sending.current = true;
    typing.current.stop();
    setBusy(true);
    setError("");
    const release = holdAppRefresh();
    try {
      const mediaIds = draft.files.length
        ? await uploadMedia(draft.files, updateStatus, {
            directConversationId: id,
            deferProcessing: true,
          })
        : [];
      if (mediaIds.some((mediaId) => mediaId.startsWith("v_"))) {
        // A manual retry also restarts a failed encode while reusing the uploaded bytes.
        for (const mediaId of mediaIds.filter((value) =>
          value.startsWith("v_"),
        ))
          await messageRequest(`/api/media/${mediaId}`, "POST");
        // Upload once and keep the send pending while the existing video worker finishes.
        for (;;) {
          const query = new URLSearchParams(
            mediaIds.map((mediaId) => ["id", mediaId]),
          );
          const result = await messageRequest<{
            media: {
              ready: boolean;
              progress: number;
              processingError: string | null;
            }[];
          }>(`/api/media/status?${query}`);
          if (result.media.length !== mediaIds.length)
            throw new Error(
              "An attachment is no longer available. Choose it again.",
            );
          const failed = result.media.find((media) => media.processingError);
          if (failed)
            throw new Error(
              failed.processingError ??
                "Video processing failed. Try sending again.",
            );
          if (result.media.every((media) => media.ready)) break;
          updateStatus(
            "Preparing your video. Your message will send when it's ready.",
            Math.round(
              result.media.reduce(
                (sum, media) => sum + (media.ready ? 100 : media.progress),
                0,
              ) / mediaIds.length,
            ),
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      const { message } = await messageRequest<{ message: DirectMessageItem }>(
        `/api/messages/${id}`,
        "POST",
        {
          clientId: draft.clientId,
          body: draft.body,
          mediaIds,
        },
      );
      const empty = { body: "", files: [], clientId: crypto.randomUUID() };
      drafts.current.set(id, empty);
      setDraft(empty);
      onSent(message);
      messagesChanged();
      textarea.current?.focus();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't send. Your message is still here. Try again.",
      );
    } finally {
      release();
      sending.current = false;
      setBusy(false);
      updateStatus("");
    }
  }

  return (
    <form
      className="dm-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        addFiles(Array.from(event.dataTransfer.files));
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) {
          event.preventDefault();
          addFiles(files);
        }
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {draft.files.length > 0 && (
        <AttachmentGroup aria-label="Selected attachments">
          {draft.files.map((file, index) => (
            <Attachment
              key={`${index}-${file.name}`}
              size="sm"
              state={busy ? "uploading" : "idle"}
            >
              <AttachmentMedia variant="image">
                {file.type.startsWith("image/") && previews[index] ? (
                  // biome-ignore lint/performance/noImgElement: local attachment preview
                  <img src={previews[index]} alt="" />
                ) : (
                  <ImagePlus />
                )}
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{file.name}</AttachmentTitle>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  disabled={busy}
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    change({ files: draft.files.filter((_, i) => i !== index) })
                  }
                >
                  <X />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      )}
      {busy && <UploadStatus status={status} percent={percent} />}
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={fieldId} className="sr-only">
          Message {name}
        </FieldLabel>
        <div className="dm-compose-row">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy || draft.files.length >= maxMediaCount}
            aria-label="Attach photos or videos"
            title="Attach photos or videos"
            onClick={() => input.current?.click()}
          >
            <ImagePlus />
          </Button>
          <Input
            ref={input}
            className="sr-only"
            tabIndex={-1}
            type="file"
            multiple
            disabled={busy}
            aria-label="Choose message attachments"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/webm,video/quicktime,.mkv,.avi,.m4v,.mpg,.mpeg,.ts"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <Textarea
            id={fieldId}
            ref={textarea}
            rows={1}
            maxLength={4000}
            className="dm-textarea"
            value={draft.body}
            disabled={busy}
            aria-invalid={Boolean(error)}
            placeholder={`Message ${name.split(" ")[0]}…`}
            onChange={(event) => {
              change({ body: event.target.value });
              typing.current.change(event.target.value);
            }}
            onBlur={() => typing.current.stop()}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                window.matchMedia("(pointer: fine)").matches
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={busy || (!draft.body.trim() && !draft.files.length)}
            aria-label="Send message"
          >
            {busy ? <Spinner /> : <Send />}
          </Button>
        </div>
      </Field>
      <div className="dm-compose-hint">
        <span>
          {group
            ? "Visible to everyone in this circle."
            : "Just between you two."}
        </span>
        <span>
          {draft.body.length > 3500
            ? `${draft.body.length}/4000`
            : "Photos & videos welcome"}
        </span>
      </div>
    </form>
  );
}
