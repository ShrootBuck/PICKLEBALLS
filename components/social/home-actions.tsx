"use client";
import { ArrowRight, Camera, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useSocial } from "@/components/social/social-provider";
import { Button } from "@/components/ui/button";

export function HomeActions() {
  const { tasks, openComposer } = useSocial();
  const done = tasks.filter((task) => task.status === "VERIFIED").length;
  return (
    <div className="home-compose">
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => openComposer({ mode: "proof" })}
        >
          <Camera data-icon="inline-start" />
          Post proof
        </Button>
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => openComposer({ mode: "check-in" })}
        >
          <MessageCircle data-icon="inline-start" />
          Check in
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3 pt-3">
        <Link
          href="/profile?tab=tasks"
          className="flex min-w-0 flex-1 items-center justify-between gap-3"
        >
          <span className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {tasks.length === 0
                ? "Start with one small commitment."
                : done === tasks.length
                  ? "All verified. You showed up."
                  : `${done} of ${tasks.length} tasks verified today`}
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
        {!tasks.length && (
          <Button size="sm" onClick={() => openComposer({ mode: "task" })}>
            <Plus data-icon="inline-start" />
            Task
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
