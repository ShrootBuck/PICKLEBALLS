"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Edit these two lines to post a new announcement. Bumping the id makes the
// banner reappear for everyone who dismissed the previous one.
export const ANNOUNCEMENT_ID = "2026-09-audit";
export const ANNOUNCEMENT_MESSAGE = "";

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
      className="relative flex min-h-10 w-full shrink-0 items-center justify-center border-b border-primary-foreground/15 bg-primary px-12 py-2.5 text-center text-sm font-medium leading-snug text-primary-foreground shadow-sm"
    >
      <p className="text-balance">{ANNOUNCEMENT_MESSAGE}</p>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={dismiss}
        aria-label="Dismiss announcement"
        className="absolute top-1/2 right-2 -translate-y-1/2 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
      >
        <X aria-hidden="true" />
      </Button>
    </section>
  );
}
