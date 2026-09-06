"use client";

export function MediaGallery({ ids }: { ids: string[] }) {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2 p-2 sm:grid-cols-2">
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
          <a
            key={id}
            href={`/api/media/${id}`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open photo ${index + 1}`}
          >
            {/* biome-ignore lint/performance/noImgElement: authenticated media endpoint */}
            <img
              src={`/api/media/${id}`}
              alt={`Attachment ${index + 1}`}
              loading="lazy"
              className="max-h-80 w-full rounded-lg bg-muted object-contain"
            />
          </a>
        ),
      )}
    </div>
  );
}
