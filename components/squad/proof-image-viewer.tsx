"use client";

import { Camera } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ProofImageViewer({
  proofId,
  title,
  compact,
}: {
  proofId: string;
  title: string;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-col items-center justify-center gap-1 bg-muted px-4 text-center text-xs text-muted-foreground",
          compact
            ? "aspect-square size-40 sm:size-44"
            : "h-64 w-full sm:h-72 md:h-auto md:min-h-80 md:w-72 md:self-stretch",
        )}
      >
        <Camera className="size-5" />
        <span>Photo unavailable. It may have been removed.</span>
      </div>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "relative block shrink-0 cursor-zoom-in overflow-hidden bg-muted",
          compact
            ? "aspect-square size-40 sm:size-44"
            : "h-64 w-full sm:h-72 md:h-auto md:min-h-80 md:w-72 md:self-stretch",
        )}
        aria-label={`Expand proof for ${title}`}
      >
        <Image
          className={compact ? "object-cover" : "object-contain"}
          src={`/api/proofs/${proofId}/image`}
          alt={`Proof for ${title}`}
          fill
          sizes={compact ? "176px" : "(max-width: 768px) 100vw, 288px"}
          unoptimized
          onError={() => setFailed(true)}
        />
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 p-4 pb-0 text-left">
          <DialogTitle className="truncate text-base">{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Full-size proof photo. Tap outside to close.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4">
          {/* biome-ignore lint/performance/noImgElement: dynamic API image, next/image offers nothing here */}
          <img
            src={`/api/proofs/${proofId}/image`}
            alt={`Full-size proof for ${title}`}
            className="max-h-[75dvh] w-full rounded-lg bg-muted object-contain"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
