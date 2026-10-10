"use client";

import { Clock3, Square } from "lucide-react";
import Link from "next/link";
import { useSocial } from "@/components/social/social-provider";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  StopwatchElapsed,
  useStopwatch,
} from "@/components/work-sessions/stopwatch-provider";
import { memberHref } from "@/lib/navigation";

export function StopwatchBar() {
  const { active, pending, stop } = useStopwatch();
  const { viewer } = useSocial();
  if (!active) return null;
  return (
    <section
      aria-label="Running stopwatch"
      className="flex shrink-0 items-center gap-3 border-b bg-card px-4 py-2.5 md:px-5"
    >
      <Clock3 className="hidden size-5 shrink-0 text-primary min-[380px]:block" />
      <Link
        href={`${memberHref(active.circleId, viewer.id, "tasks")}&focus=${encodeURIComponent(active.taskId)}`}
        className="min-w-0 flex-1"
      >
        <span className="block text-xs text-muted-foreground">Working on</span>
        <span className="block truncate text-sm font-medium">
          {active.title}
        </span>
      </Link>
      <StopwatchElapsed session={active} />
      <Button size="sm" disabled={pending} onClick={() => void stop(active.id)}>
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <Square data-icon="inline-start" />
        )}{" "}
        Stop
      </Button>
    </section>
  );
}
