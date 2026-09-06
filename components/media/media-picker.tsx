"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  maxMediaCount,
  maxPhotoBytes,
  maxVideoBytes,
} from "@/lib/media-policy";

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
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>
        {required ? "Proof photos or videos" : "Attach photos or videos"}
      </FieldLabel>
      <Input
        id={id}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const added = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length + added.length > maxMediaCount) {
            setError("Choose up to six files.");
            return;
          }
          if (
            added.some(
              (file) =>
                file.size === 0 ||
                file.size >
                  (file.type.startsWith("video/")
                    ? maxVideoBytes
                    : maxPhotoBytes),
            )
          ) {
            setError("Photos: up to 100 MB. Videos: up to 50 MB.");
            return;
          }
          setError("");
          onChange([...files, ...added]);
        }}
      />
      <FieldDescription id={`${id}-help`}>
        {error ||
          "Up to 6 files. Photos: 100 MB, resized with location data removed. Videos: 50 MB (MP4, MOV, WebM)."}
      </FieldDescription>
      {files.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}-${index}`}
              className="flex min-w-0 flex-col gap-1"
            >
              {previews[index] &&
                (file.type.startsWith("video/") ? (
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
              <span className="truncate text-xs">{file.name}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
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
