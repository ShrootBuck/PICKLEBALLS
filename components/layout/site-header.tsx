"use client";

import { MidnightCountdown } from "@/components/today/midnight-countdown";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 md:px-6">
      <SidebarTrigger className="size-9 shrink-0 touch-manipulation" />
      <div className="ml-auto shrink-0">
        <MidnightCountdown compact />
      </div>
    </header>
  );
}
