"use client";

import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { StreakLogButton } from "@/components/streaks/streak-log";
import { countLabel } from "@/components/streaks/streak-text";
import { StreakEmber } from "@/components/streaks/streak-visuals";
import type { StreakView } from "@/lib/streak-policy";

function hint(view: StreakView) {
  return `${view.summary.current} ${countLabel(view.kind, view.summary.current)}. Log today.`;
}

export function StreakToday({ streaks }: { streaks: StreakView[] }) {
  if (!streaks.length) return null;
  return (
    <section aria-labelledby="streak-today-title" className="today-card">
      <div className="today-card-header">
        <h2
          id="streak-today-title"
          className="today-card-title flex items-center gap-2"
        >
          <Flame className="size-4 text-primary" />
          Keep your streaks going
        </h2>
        <Link
          href="/streaks"
          className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          All streaks
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <ul className="flex flex-col px-4 pb-2 md:px-5">
        {streaks.map((view) => (
          <li key={view.id} className="streak-today-row">
            <StreakEmber
              count={view.summary.current}
              size={30}
              dim={view.summary.current === 0}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{view.title}</p>
              <p className="text-xs text-muted-foreground">{hint(view)}</p>
            </div>
            <div className="streak-today-action">
              <StreakLogButton streak={view} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
