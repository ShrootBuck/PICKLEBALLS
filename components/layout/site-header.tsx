"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BoardSync } from "@/components/layout/board-sync";
import { MidnightCountdown } from "@/components/today/midnight-countdown";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function SiteHeader({ bell }: { bell: ReactNode }) {
  const pathname = usePathname();
  const title =
    {
      "/": "Today",
      "/squad": "Squad",
      "/history": "History",
      "/timeblock": "Timeblock",
      "/changelog": "Changelog",
      "/admin": "Owner tools",
    }[pathname] ?? "Workspace";

  return (
    <header className="flex min-h-14 shrink-0 items-center gap-2 border-b bg-background/92 px-3 backdrop-blur-md sm:px-4 md:px-6">
      <SidebarTrigger className="size-10 shrink-0 touch-manipulation md:size-9" />
      <span className="truncate text-sm font-medium text-muted-foreground">
        {title}
      </span>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
        <BoardSync />
        {bell}
        <MidnightCountdown compact />
      </div>
    </header>
  );
}
