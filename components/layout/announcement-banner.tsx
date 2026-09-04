"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

// Edit these two lines to post a new announcement. Bumping the id makes the
// banner reappear for everyone who dismissed the previous one.
export const ANNOUNCEMENT_ID = "pause-gpt6-2026-09-04";
export const ANNOUNCEMENT_MESSAGE =
  "Pausing new updates until I get GPT-6 access tomorrow.";

function storageKey(id: string) {
  return `announcement-dismissed:${id}`;
}

export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey(ANNOUNCEMENT_ID)) === "1") {
        setDismissed(true);
      }
    } catch {
      // Private mode etc. — just show the banner.
    }
  }, []);

  if (dismissed || ANNOUNCEMENT_MESSAGE.trim() === "") {
    return null;
  }

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(ANNOUNCEMENT_ID), "1");
    } catch {
      // Ignore storage failures; still hide for this session.
    }
    setDismissed(true);
  }

  return (
    <section
      aria-label="Announcement"
      className="relative z-50 flex w-full items-center justify-center gap-2 bg-primary px-10 py-2 text-center text-sm font-medium text-primary-foreground"
    >
      <p className="text-balance">{ANNOUNCEMENT_MESSAGE}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 touch-manipulation items-center justify-center rounded-md transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </section>
  );
}
