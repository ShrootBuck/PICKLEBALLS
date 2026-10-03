"use client";

import { ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { StreakLogButton } from "@/components/streaks/streak-log";
import { countLabel } from "@/components/streaks/streak-text";
import { StreakEmber } from "@/components/streaks/streak-visuals";
import { type StreakView, streakActions } from "@/lib/streak-policy";

function hint(view: StreakView) {
  const actions = streakActions(view, view.summary);
  if (view.kind === "QUIT")
    return "Was yesterday clean? Confirm it before midnight.";
  if (actions.breaksTonight) return "Yesterday needs a log before midnight.";
  return `${view.summary.current} ${countLabel(view.kind, view.summary.current)}. Log today.`;
}

export function StreakToday({ streaks }: { streaks: StreakView[] }) {
  if (!streaks.length) return null;
  return (
    <section
      aria-labelledby="streak-today-title"
      className="flex flex-col gap-1 rounded-xl border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <h2
          id="streak-today-title"
          className="flex items-center gap-2 text-sm font-semibold"
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
      <ul className="flex flex-col">
        {streaks.map((view) => (
          <li key={view.id} className="flex items-center gap-3 px-1 py-2">
            <StreakEmber
              count={view.summary.current}
              size={30}
              dim={view.summary.current === 0}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                <span aria-hidden="true" className="mr-1">
                  {view.emoji}
                </span>{" "}
                {view.title}
              </p>
              <p className="text-xs text-muted-foreground">{hint(view)}</p>
            </div>
            <StreakLogButton streak={view} />
          </li>
        ))}
      </ul>
    </section>
  );
}
