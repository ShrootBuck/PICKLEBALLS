"use client";

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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          "relative block shrink-0 cursor-zoom-in overflow-hidden bg-muted",
          compact
            ? "size-24 sm:size-28"
            : "h-44 w-full md:h-auto md:min-h-44 md:w-56",
        )}
        aria-label={`Expand proof for ${title}`}
      >
        <Image
          className="object-cover"
          src={`/api/proofs/${proofId}/image`}
          alt={`Proof for ${title}`}
          fill
          sizes={compact ? "112px" : "(max-width: 768px) 100vw, 224px"}
          unoptimized
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
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
