"use client";

import { FileImage, Trash2, Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function FileUpload({
  id,
  accept = "image/png,image/jpeg,image/webp,image/heic,image/heif",
  required,
  onFileChange,
  label = "Proof photo",
  description = "PNG, JPEG, WebP, HEIC, or HEIF. Maximum 6 MB.",
  className,
}: {
  id?: string;
  accept?: string;
  required?: boolean;
  onFileChange?: (file: File | null) => void;
  label?: string;
  description?: string;
  className?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleChange = () => {
    const file = ref.current?.files?.[0] ?? null;
    if (file) {
      setFileName(file.name);
      setFileSize(`${(file.size / 1024 / 1024).toFixed(2)} MB`);
      onFileChange?.(file);
    } else {
      setFileName(null);
      setFileSize(null);
      onFileChange?.(null);
    }
  };

  const clear = () => {
    if (ref.current) {
      ref.current.value = "";
      setFileName(null);
      setFileSize(null);
      onFileChange?.(null);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium leading-none">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </label>
        {fileName && (
          <Badge variant="secondary" className="max-w-[14rem] truncate">
            {fileName}
          </Badge>
        )}
      </div>
      {/* Drop zone is progressive enhancement: the "Choose file" button
          below stays the keyboard path, so no interactive role here. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target only */}
      <div
        className={cn(
          "group relative flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-6 text-center transition-colors hover:bg-muted/50 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 sm:px-6 sm:py-8",
          fileName && "border-solid bg-card hover:bg-card",
          dragging && "border-solid border-ring bg-muted/60",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file && ref.current) {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            ref.current.files = transfer.files;
            handleChange();
          }
        }}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Upload className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {fileName ? "File selected" : "Drop or tap to upload"}
          </p>
          <p className="text-xs text-muted-foreground">{description}</p>
          {fileSize && <p className="text-xs font-medium">{fileSize}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant={fileName ? "outline" : "default"}
            size="sm"
            onClick={() => ref.current?.click()}
            className="touch-manipulation"
          >
            <FileImage data-icon="inline-start" />
            {fileName ? "Change file" : "Choose file"}
          </Button>
          {fileName && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              className="touch-manipulation"
            >
              <Trash2 data-icon="inline-start" />
              Clear
            </Button>
          )}
        </div>
        {/* Hidden from tab order: the "Choose file" button above is the
            keyboard path. Never mark this input required: native validation
            cannot focus an sr-only + tabIndex={-1} control, which blocks
            submit and makes the form's custom empty-file error unreachable.
            Callers validate the FormData instead. */}
        <Input
          ref={ref}
          id={inputId}
          name="image"
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
