"use client";

import { ArrowUpRight, CalendarRange } from "lucide-react";
import Link from "next/link";
import { useSocial } from "@/components/social/social-provider";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function TodaySummary({
  greeting,
  date,
}: {
  greeting: string;
  date: string;
}) {
  const { viewer, tasks } = useSocial();
  const verified = tasks.filter((task) => task.status === "VERIFIED").length;
  const reviewing = tasks.filter(
    (task) => task.status === "AWAITING_REVIEW",
  ).length;
  const open = tasks.filter(
    (task) => task.status === "OPEN" || task.status === "RENEGOTIATED",
  ).length;
  const firstName = viewer.name.trim().split(/\s+/)[0] || viewer.name;
  return (
    <header className="today-overview">
      <div className="today-heading">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="page-eyebrow">{date}</p>
          <h1 className="page-title">
            {greeting}, {firstName}
          </h1>
        </div>
        <Link
          href="/timeblock"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <CalendarRange data-icon="inline-start" />
          Weekly timeblock
          <ArrowUpRight data-icon="inline-end" />
        </Link>
      </div>
      <section aria-label="Today at a glance" className="today-stats">
        <div>
          <p className="today-stat-value">
            {verified}
            <span>/{tasks.length}</span>
          </p>
          <p className="today-stat-label">Verified</p>
          <Progress
            value={tasks.length ? (verified / tasks.length) * 100 : 0}
            aria-label={`${verified} of ${tasks.length} tasks verified`}
            className="mt-2"
          />
        </div>
        <div>
          <p className="today-stat-value">{open}</p>
          <p className="today-stat-label">Need proof</p>
        </div>
        <div>
          <p className="today-stat-value">{reviewing}</p>
          <p className="today-stat-label">In review</p>
        </div>
      </section>
    </header>
  );
}
