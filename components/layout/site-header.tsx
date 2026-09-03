"use client";

import { MidnightCountdown } from "@/components/today/midnight-countdown";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="size-9 shrink-0 touch-manipulation" />
      <div className="ml-auto shrink-0">
        <MidnightCountdown compact />
      </div>
    </header>
  );
}
