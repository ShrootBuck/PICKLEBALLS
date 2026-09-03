"use client";

import type { ReactNode } from "react";
import { MidnightCountdown } from "@/components/today/midnight-countdown";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({ bell }: { bell: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="size-9 shrink-0 touch-manipulation" />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {bell}
        <MidnightCountdown compact />
      </div>
    </header>
  );
}
