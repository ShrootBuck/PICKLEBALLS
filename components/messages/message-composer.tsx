"use client";

import { ImagePlus, Send, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useMessages } from "@/components/messages/message-provider";
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
  onSend,
}: {
  id: string;
  name: string;
  group: boolean;
  onSend: () => void;
}) {
  const fieldId = useId();
  const typing = useTypingSender(id);
  const { store, drafts, ready } = useMessages();
  const draft = drafts[id] ?? emptyDraft;
  const [error, setError] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const urls = draft.files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [draft.files]);

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
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {draft.files.length > 0 && (
        <AttachmentGroup aria-label="Selected attachments">
          {draft.files.map((file, index) => (
            <Attachment key={`${index}-${file.name}`} size="sm" state="idle">
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
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={fieldId} className="sr-only">
          Message {name}
        </FieldLabel>
        <div className="dm-compose-row">
          <Button
            type="button"
            variant="ghost"
            size="icon"
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
            placeholder={`Message ${group ? name : name.split(" ")[0]}…`}
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
                event.nativeEvent.keyCode !== 229
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!ready || (!draft.body.trim() && !draft.files.length)}
            aria-label="Send message"
            onPointerDown={(event) => event.preventDefault()}
          >
            <Send />
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
            : "Enter to send, Shift+Enter for a new line"}
        </span>
      </div>
    </form>
  );
}
