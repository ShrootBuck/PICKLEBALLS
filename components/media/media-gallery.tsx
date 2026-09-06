"use client";

import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function MediaGallery({ ids }: { ids: string[] }) {
  const photos = ids.filter((id) => !id.startsWith("v_"));
  const [selectedIndex, setSelected] = useState(0);
  const selected = Math.min(selectedIndex, Math.max(0, photos.length - 1));
  if (ids.length === 0) return null;

  return (
    <Dialog>
      <div
        className={cn(
          "grid w-full min-w-0 grid-cols-1 gap-2 p-2",
          ids.length > 1 && "sm:grid-cols-2",
        )}
      >
        {ids.map((id, index) =>
          id.startsWith("v_") ? (
            <div key={id} className="flex flex-col gap-1">
              {/* biome-ignore lint/a11y/useMediaCaption: user-uploaded video has no caption track */}
              <video
                src={`/api/media/${id}`}
                controls
                playsInline
                preload="metadata"
                className="max-h-80 w-full rounded-lg bg-muted"
                aria-label={`Video attachment ${index + 1}`}
              />
              <a
                className="text-xs underline"
                href={`/api/media/${id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open video {index + 1}
              </a>
            </div>
          ) : (
            <DialogTrigger
              key={id}
              onClick={() => setSelected(photos.indexOf(id))}
              className="min-w-0 cursor-zoom-in rounded-lg outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Open photo ${index + 1}`}
            >
              {/* biome-ignore lint/performance/noImgElement: authenticated media endpoint */}
              <img
                src={`/api/media/${id}`}
                alt={`Attachment ${index + 1}`}
                loading="lazy"
                className="max-h-80 w-full rounded-lg bg-muted object-contain"
              />
            </DialogTrigger>
          ),
        )}
      </div>
      {photos.length > 0 && (
        <DialogContent
          className="sm:max-w-3xl"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              setSelected(Math.max(0, selected - 1));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              setSelected(Math.min(photos.length - 1, selected + 1));
            }
          }}
        >
          <DialogHeader>
            <DialogTitle aria-live="polite">
              Photo {selected + 1} of {photos.length}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Full-size attachment. Use the arrow keys to browse photos or
              Escape to close.
            </DialogDescription>
          </DialogHeader>
          {/* biome-ignore lint/performance/noImgElement: authenticated media endpoint */}
          <img
            src={`/api/media/${photos[selected]}`}
            alt={`Attachment ${selected + 1} of ${photos.length}`}
            className="max-h-[65dvh] w-full rounded-lg bg-muted object-contain"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              render={
                // biome-ignore lint/a11y/useAnchorContent: Button supplies the link contents
                <a
                  href={`/api/media/${photos[selected]}`}
                  aria-label="Open original in a new tab"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <ExternalLink data-icon="inline-start" />
              Open original
            </Button>
            {photos.length > 1 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous photo"
                  disabled={selected === 0}
                  onClick={() => setSelected(selected - 1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next photo"
                  disabled={selected === photos.length - 1}
                  onClick={() => setSelected(selected + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
