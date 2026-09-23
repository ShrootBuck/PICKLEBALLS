"use client";
import { ArrowRight, Camera, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useSocial } from "@/components/social/social-provider";
import { Button } from "@/components/ui/button";

export function HomeActions() {
  const { tasks, openComposer } = useSocial();
  const done = tasks.filter((task) => task.status === "VERIFIED").length;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => openComposer({ mode: "proof" })}
        >
          <Camera data-icon="inline-start" />
          Post proof
        </Button>
        <Button
          variant="secondary"
          onClick={() => openComposer({ mode: "check-in" })}
        >
          <MessageCircle data-icon="inline-start" />
          Check in
        </Button>
      </div>
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
