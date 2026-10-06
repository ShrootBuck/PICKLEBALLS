"use client";
import { ArrowRight, Camera, Flame, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useSocial } from "@/components/social/social-provider";
import { Button } from "@/components/ui/button";

export function HomeActions() {
  const { tasks, openComposer } = useSocial();
  const done = tasks.filter((task) => task.status === "VERIFIED").length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <Link
          href="/goals"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <Target className="size-4" />
          Your goals
        </Link>
        <Link
          href="/streaks"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <Flame className="size-4" />
          Streaks
        </Link>
      </div>
      <Button
        variant="secondary"
        onClick={() => openComposer({ mode: "proof" })}
      >
        <Camera data-icon="inline-start" />
        Post proof
      </Button>
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link
          href="/profile?tab=tasks"
          className="group flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="truncate">
            {tasks.length === 0
              ? "No tasks yet today."
              : done === tasks.length
                ? "All tasks verified. You showed up."
                : `${done} of ${tasks.length} tasks verified today`}
          </span>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
        {!tasks.length && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openComposer({ mode: "task" })}
          >
            <Plus data-icon="inline-start" />
            Add task
          </Button>
        )}
      </div>
    </div>
  );
}

export function AddTaskButton() {
  const { openComposer } = useSocial();
  return (
    <Button size="sm" onClick={() => openComposer({ mode: "task" })}>
      <Plus data-icon="inline-start" /> Add task
    </Button>
  );
}
