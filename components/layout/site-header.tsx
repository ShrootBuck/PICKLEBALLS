"use client";

import {
  type BellEvent,
  NotificationBell,
} from "@/components/layout/notification-bell";
import { MidnightCountdown } from "@/components/today/midnight-countdown";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({ events }: { events: BellEvent[] }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="size-9 shrink-0 touch-manipulation" />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <NotificationBell events={events} />
        <MidnightCountdown compact />
      </div>
    </header>
  );
}
