"use client";

import { ArrowUp, Film, ImageIcon, ImagePlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useMessages } from "@/components/messages/message-provider";
import { useObjectUrls } from "@/components/messages/use-object-urls";
import { useTypingSender } from "@/components/messages/use-typing";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentGroup,
  AttachmentMedia,
} from "@/components/ui/attachment";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  maxMediaCount,
  mediaMimeType,
  uploadTicketSchema,
} from "@/lib/media-policy";
import type { MessageDraft } from "@/lib/message-outbox";

const emptyDraft: MessageDraft = { body: "", files: [] };

export function MessageComposer({
  id,
  name,
  group,
  reply,
  onSend,
}: {
  id: string;
  name: string;
  group: boolean;
  /** The message the draft replies to, when it is loaded in the thread. */
  reply: { name: string; preview: string } | null;
  onSend: () => void;
}) {
  const fieldId = useId();
  const typing = useTypingSender(id);
  const { store, drafts, ready } = useMessages();
  const draft = drafts[id] ?? emptyDraft;
  const [error, setError] = useState("");
  const previews = useObjectUrls(draft.files);
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canSend = ready && Boolean(draft.body.trim() || draft.files.length);
  // Choosing Reply moves straight to typing.
  useEffect(() => {
    if (draft.replyToId) textarea.current?.focus({ preventScroll: true });
  }, [draft.replyToId]);

  function change(next: Partial<MessageDraft>) {
    store.setDraft(id, { ...draft, ...next });
    setError("");
  }
  function addFiles(files: File[]) {
    if (!ready || !files.length) return;
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
  function send() {
    if (!ready || !store.enqueue(id)) return;
    typing.current.stop();
    setError("");
    // Focus synchronously while the keyboard gesture is still active on mobile.
    textarea.current?.focus({ preventScroll: true });
    onSend();
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
        <p role="alert" className="dm-compose-error">
          {error}
        </p>
      )}
      <Field data-invalid={Boolean(error)} className="dm-compose-field">
        <FieldLabel htmlFor={fieldId} className="sr-only">
          Message {name}
        </FieldLabel>
        <div className="dm-compose-box">
          {draft.replyToId && (
            <div className="dm-compose-reply">
              <p className="dm-compose-reply-text">
                Replying to{" "}
                <span className="dm-compose-reply-name">
                  {reply?.name ?? "a message"}
                </span>
                {reply && (
                  <span className="dm-compose-reply-preview">
                    {reply.preview}
                  </span>
                )}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Cancel reply"
                title="Cancel reply (Esc)"
                onClick={() => change({ replyToId: undefined })}
              >
                <X />
              </Button>
            </div>
          )}
          {draft.files.length > 0 && (
            <AttachmentGroup
              aria-label="Selected attachments"
              className="dm-compose-files"
            >
              {draft.files.map((file, index) => (
                <Attachment
                  key={`${index}-${file.name}`}
                  size="xs"
                  state="idle"
                  className="dm-compose-file"
                  title={file.name}
                >
                  <AttachmentMedia variant="image">
                    {previews[index] ? (
                      // biome-ignore lint/performance/noImgElement: local attachment preview
                      <img src={previews[index]} alt="" />
                    ) : file.type.startsWith("video/") ? (
                      <Film />
                    ) : (
                      <ImageIcon />
                    )}
                  </AttachmentMedia>
                  <AttachmentActions>
                    <AttachmentAction
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        change({
                          files: draft.files.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <X />
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              ))}
            </AttachmentGroup>
          )}
          <div className="dm-compose-row">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="dm-attach"
              disabled={!ready || draft.files.length >= maxMediaCount}
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
              enterKeyHint="send"
              maxLength={4000}
              className="dm-textarea"
              value={draft.body}
              disabled={!ready}
              aria-invalid={Boolean(error)}
              placeholder={`Message ${group ? name : name.split(" ")[0]}`}
              onChange={(event) => {
                change({ body: event.target.value });
                typing.current.change(event.target.value);
              }}
              onBlur={() => typing.current.stop()}
              onKeyDown={(event) => {
                if (event.key === "Escape" && draft.replyToId) {
                  event.preventDefault();
                  change({ replyToId: undefined });
                  return;
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.nativeEvent.keyCode !== 229
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            {draft.body.length > 3500 && (
              <span className="dm-compose-count" aria-live="polite">
                {4000 - draft.body.length}
                <span className="sr-only"> characters left</span>
              </span>
            )}
            <Button
              type="submit"
              size="icon-sm"
              className="dm-send"
              disabled={!canSend}
              aria-label="Send message"
              title="Send (Enter). Shift+Enter adds a new line."
              onPointerDown={(event) => event.preventDefault()}
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </Field>
    </form>
  );
}
