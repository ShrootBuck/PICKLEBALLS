"use client";

import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MediaGallery({
  ids,
  legacyProofId,
  compact = false,
}: {
  ids: string[];
  legacyProofId?: string;
  compact?: boolean;
}) {
  const items = ids.length
    ? ids.map((id) => ({
        id,
        video: id.startsWith("v_"),
        src: `/api/media/${id}`,
      }))
    : legacyProofId
      ? [
          {
            id: legacyProofId,
            video: false,
            src: `/api/proofs/${legacyProofId}/image`,
          },
        ]
      : [];
  const scroller = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, Math.max(0, items.length - 1));
  if (!items.length) return null;
  function go(next: number) {
    const node = scroller.current;
    if (!node) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    node.scrollTo({
      left: next * node.clientWidth,
      behavior: reduced ? "instant" : "smooth",
    });
  }
  return (
    <Dialog>
      <section className="min-w-0" aria-label="Post attachments">
        <div
          ref={scroller}
          className="media-slides"
          onScroll={(event) => {
            const node = event.currentTarget;
            const next = Math.round(
              node.scrollLeft / Math.max(1, node.clientWidth),
            );
            setSlide(next);
            for (const video of node.querySelectorAll("video")) {
              if (video.dataset.slide !== String(next)) video.pause();
            }
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.id}
              className="media-slide"
              style={compact ? { maxHeight: 300 } : undefined}
            >
              {item.video ? (
                <>
                  {/* biome-ignore lint/a11y/useMediaCaption: member-uploaded evidence has no caption track */}
                  <video
                    data-slide={i}
                    src={item.src}
                    poster={`${item.src}?poster=1`}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`Video ${i + 1} of ${items.length}`}
                  />
                  <DialogTrigger
                    render={
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-3 right-3"
                      />
                    }
                    aria-label={`View full video ${i + 1} of ${items.length}`}
                    onClick={() => {
                      for (const video of scroller.current?.querySelectorAll(
                        "video",
                      ) ?? [])
                        video.pause();
                      setSelected(i);
                    }}
                  >
                    <Maximize />
                  </DialogTrigger>
                </>
              ) : (
                <DialogTrigger
                  render={
                    <Button variant="ghost" className="media-slide-trigger" />
                  }
                  aria-label={`View full photo ${i + 1} of ${items.length}`}
                  onClick={() => setSelected(i)}
                >
                  {/* biome-ignore lint/performance/noImgElement: private authenticated media */}
                  <img
                    src={item.src}
                    loading="lazy"
                    alt={`Proof attachment ${i + 1}`}
                  />
                </DialogTrigger>
              )}
            </div>
          ))}
        </div>
        {items.length > 1 && (
          <div className="media-position">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous attachment"
              disabled={slide === 0}
              onClick={() => go(slide - 1)}
            >
              <ChevronLeft />
            </Button>
            <output className="px-2 text-xs text-muted-foreground tabular-nums">
              {slide + 1} / {items.length}
            </output>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next attachment"
              disabled={slide === items.length - 1}
              onClick={() => go(slide + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </section>
      <DialogContent
        className="media-viewer"
        onKeyDown={(event) => {
          if (event.target instanceof HTMLVideoElement) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            setSelected(Math.max(0, index - 1));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            setSelected(Math.min(items.length - 1, index + 1));
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Attachment {index + 1} of {items.length}
          </DialogTitle>
          <DialogDescription>
            Full evidence, without cropping.
            {items.length > 1 && " Use the arrows to browse."}
          </DialogDescription>
        </DialogHeader>
        {items[index].video ? (
          // biome-ignore lint/a11y/useMediaCaption: member-uploaded evidence has no caption track
          <video
            key={items[index].id}
            src={items[index].src}
            poster={`${items[index].src}?poster=1`}
            controls
            playsInline
            preload="metadata"
            aria-label="Full video evidence"
          />
        ) : (
          // biome-ignore lint/performance/noImgElement: private authenticated media
          <img src={items[index].src} alt={`Full attachment ${index + 1}`} />
        )}
        <div className="flex items-center justify-between gap-3">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={
              <a
                href={items[index].src}
                target="_blank"
                rel="noreferrer"
                aria-label="Open full attachment"
              >
                Open full attachment
              </a>
            }
          >
            <ExternalLink data-icon="inline-start" /> Open full attachment
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous full attachment"
              disabled={index === 0}
              onClick={() => setSelected(index - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next full attachment"
              disabled={index === items.length - 1}
              onClick={() => setSelected(index + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
