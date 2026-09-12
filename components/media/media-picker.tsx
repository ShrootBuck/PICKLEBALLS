"use client";

import { Camera, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  maxMediaCount,
  mediaMimeType,
  uploadTicketSchema,
} from "@/lib/media-policy";
import { cn } from "@/lib/utils";

export function MediaPicker({
  files,
  onChange,
  disabled,
  required = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);
  function addFiles(added: File[]) {
    if (disabled || !added.length) return;
    const next = [...files];
    const problems: string[] = [];
    for (const file of added) {
      if (
        next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified,
        )
      ) {
        problems.push(`${file.name} is already selected.`);
      } else if (
        !uploadTicketSchema.safeParse({
          mimeType: mediaMimeType(file),
          sizeBytes: file.size,
        }).success
      ) {
        problems.push(
          `${file.name}: choose a supported photo up to 100 MB or video up to 5 GB. Empty files cannot be attached.`,
        );
      } else if (next.length >= maxMediaCount) {
        problems.push(
          "You can attach up to six files. Remove one to add another.",
        );
        break;
      } else {
        next.push(file);
      }
    }
    setError(problems.join(" "));
    if (next.length !== files.length) onChange(next);
  }

  return (
    <Field data-invalid={Boolean(error)} data-disabled={disabled}>
      <FieldLabel htmlFor={id}>
        {required ? "Proof photos or videos" : "Attach photos or videos"}
      </FieldLabel>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target has a keyboard-accessible choose button */}
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border border-dashed p-5 text-center transition-colors",
          dragging && !disabled ? "border-primary bg-muted" : "bg-muted/30",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <Upload className="size-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          {dragging && !disabled
            ? "Drop files here"
            : "Drop photos or videos here"}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || files.length >= maxMediaCount}
          onClick={() => inputRef.current?.click()}
        >
          {files.length ? "Add files" : "Choose files"}
        </Button>
        <Input
          ref={inputRef}
          id={id}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/webm,video/quicktime,.mkv,.avi,.m4v,.mpg,.mpeg,.ts"
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-help`}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
      <Input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-label="Take a proof photo"
        disabled={disabled}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled || files.length >= maxMediaCount}
        onClick={() => cameraRef.current?.click()}
      >
        <Camera data-icon="inline-start" /> Take a photo
      </Button>
      <FieldDescription id={`${id}-help`} aria-live="polite">
        {error ||
          "Up to 6 files. Photos up to 100 MB, videos up to 5 GB. Keep this tab open while files upload."}
      </FieldDescription>
      <output className="text-xs text-muted-foreground">
        {files.length} of {maxMediaCount} attachments selected
      </output>
      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex min-w-0 flex-col gap-1"
            >
              {previews[index] &&
                (mediaMimeType(file).startsWith("video/") ? (
                  // biome-ignore lint/a11y/useMediaCaption: local user-uploaded preview has no caption track
                  <video
                    src={previews[index]}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={file.name}
                    className="h-24 w-full rounded-md bg-muted object-contain"
                  />
                ) : (
                  // biome-ignore lint/performance/noImgElement: local object URL preview
                  <img
                    src={previews[index]}
                    alt={file.name}
                    className="h-24 w-full rounded-md bg-muted object-contain"
                  />
                ))}
              <span className="truncate text-xs" title={file.name}>
                {file.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {file.size < 1024 * 1024
                  ? `${Math.max(1, Math.round(file.size / 1024))} KB`
                  : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setError("");
                  onChange(files.filter((_, i) => i !== index));
                }}
                aria-label={`Remove ${file.name}`}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}
